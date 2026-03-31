import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ─── LLM Proxy ───
// Server-side LLM proxy that injects API keys so they never reach the browser.
// Configuration via environment variables:
//   LLM_PROXY_API_KEY        – Shared API key for all endpoints
//   LLM_PROXY_MODELS_CONFIG  – JSON array of per-model configs:
//     [{ "name": "gpt-5.3-chat", "endpoint": "https://...", "apiType": "chat" }, ...]
//     apiType: "chat" (chat/completions, default) or "responses" (Responses API)
//   LLM_PROXY_DEFAULT_MODEL  – (optional) Default model name

interface ModelConfig {
  name: string;
  endpoint: string;
  apiType?: 'chat' | 'responses';
  inputPer1M?: number;
  outputPer1M?: number;
}

interface LLMProxyConfig {
  apiKey: string;
  models: ModelConfig[];
  defaultModel: string;
}

function getLLMProxyConfig(): LLMProxyConfig | null {
  const apiKey = process.env.LLM_PROXY_API_KEY;
  const configStr = process.env.LLM_PROXY_MODELS_CONFIG;

  if (!apiKey || !configStr) return null;

  let models: ModelConfig[];
  try {
    models = JSON.parse(configStr);
  } catch {
    return null;
  }
  if (!Array.isArray(models) || models.length === 0) return null;

  // Normalize endpoints
  for (const m of models) {
    m.endpoint = m.endpoint.replace(/\/+$/, '');
    if (!m.apiType) m.apiType = 'chat';
  }

  const defaultModel = process.env.LLM_PROXY_DEFAULT_MODEL || models[0].name;
  return { apiKey, models, defaultModel };
}

function buildTargetUrl(model: ModelConfig): string {
  const endpoint = model.endpoint;
  const deployment = encodeURIComponent(model.name);

  // Azure AI Foundry (.services.ai.azure.com) uses OpenAI-compatible v1 path
  // Model name goes in the request body, not the URL path
  if (endpoint.includes('.services.ai.azure.com')) {
    if (model.apiType === 'responses') {
      return `${endpoint}/openai/v1/responses`;
    }
    return `${endpoint}/openai/v1/chat/completions`;
  }

  // Azure OpenAI (.openai.azure.com) uses deployment-based path
  if (model.apiType === 'responses') {
    return `${endpoint}/openai/deployments/${deployment}/responses?api-version=2025-03-01-preview`;
  }
  return `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-12-01-preview`;
}

async function llmModelsHandler(request: HttpRequest): Promise<HttpResponseInit> {
  const config = getLLMProxyConfig();
  if (!config) {
    return { status: 503, jsonBody: { error: 'LLM proxy not configured' } };
  }
  return {
    status: 200,
    jsonBody: {
      models: config.models.map(m => ({ name: m.name, apiType: m.apiType || 'chat', inputPer1M: m.inputPer1M, outputPer1M: m.outputPer1M })),
      default: config.defaultModel,
    },
    headers: { 'Content-Type': 'application/json' },
  };
}

async function llmProxyChatHandler(request: HttpRequest): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') {
    return { status: 204, headers: { 'Allow': 'POST, OPTIONS' } };
  }

  const config = getLLMProxyConfig();
  if (!config) {
    return { status: 503, jsonBody: { error: 'LLM proxy not configured' } };
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
  }

  // Resolve model from request body
  const requestedModel = (typeof body.model === 'string' && body.model) || config.defaultModel;
  const modelConfig = config.models.find(m => m.name === requestedModel);
  if (!modelConfig) {
    return {
      status: 400,
      jsonBody: { error: `Model "${requestedModel}" is not available. Allowed: ${config.models.map(m => m.name).join(', ')}` },
    };
  }

  const targetUrl = buildTargetUrl(modelConfig);

  // Forward with server-side API key — never expose the key to the client
  // Retry with exponential backoff on transient failures (network errors, 502/503/504)
  const MAX_RETRIES = 3;
  let upstream: Response;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1))); // 1s, 2s
    }
    try {
      upstream = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': config.apiKey,
        },
        body: JSON.stringify(body),
      });
      if (upstream.status === 502 || upstream.status === 503 || upstream.status === 504) {
        lastErr = new Error(`Upstream returned ${upstream.status}`);
        if (attempt < MAX_RETRIES - 1) continue;
      }
      break; // success or non-retryable status
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES - 1) continue;
    }
  }
  if (!upstream!) {
    return { status: 502, jsonBody: { error: 'Failed to reach upstream LLM endpoint' } };
  }

  // Build response, stripping hop-by-hop headers
  const responseHeaders: Record<string, string> = {};
  upstream.headers.forEach((value: string, key: string) => {
    if (!HOP_HEADERS.has(key.toLowerCase())) {
      responseHeaders[key] = value;
    }
  });

  const responseBody = await upstream.arrayBuffer();
  return {
    status: upstream.status,
    headers: responseHeaders,
    body: new Uint8Array(responseBody),
  };
}



// ─── Bicep Compile ───
// Compiles Bicep to ARM JSON template using the Azure CLI.
// Input: { bicep: "param name string\nresource ..." }
// Output: { template: { ... ARM JSON ... } }

async function bicepCompileHandler(request: HttpRequest): Promise<HttpResponseInit> {
  let body: { bicep: string };
  try {
    body = await request.json() as { bicep: string };
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
  }

  if (!body.bicep || typeof body.bicep !== 'string') {
    return { status: 400, jsonBody: { error: 'Missing "bicep" field with Bicep source code' } };
  }

  let tempDir: string;
  try {
    tempDir = await mkdtemp(join(tmpdir(), 'bicep-'));
  } catch (err) {
    return { status: 500, jsonBody: { error: 'Failed to create temp directory' } };
  }

  const bicepPath = join(tempDir, 'main.bicep');
  const jsonPath = join(tempDir, 'main.json');

  try {
    // Write Bicep content to temp file
    await writeFile(bicepPath, body.bicep, 'utf-8');

    // Compile using az bicep build
    try {
      await execFileAsync('az', ['bicep', 'build', '--file', bicepPath, '--outfile', jsonPath], {
        timeout: 30000,
      });
    } catch (err: any) {
      const stderr = err.stderr || err.message || 'Compilation failed';
      return { status: 422, jsonBody: { error: 'Bicep compilation failed', details: stderr } };
    }

    // Read compiled ARM JSON
    const armJson = await readFile(jsonPath, 'utf-8');
    const template = JSON.parse(armJson);

    return {
      status: 200,
      jsonBody: { template },
      headers: { 'Content-Type': 'application/json' },
    };
  } finally {
    // Clean up temp files
    try { await unlink(bicepPath); } catch {}
    try { await unlink(jsonPath); } catch {}
    try { const { rmdir } = await import('fs/promises'); await rmdir(tempDir); } catch {}
  }
}

// ─── Allowed proxy targets ───
// Only these exact host/path prefixes are proxied to prevent open-redirect attacks.
const ALLOWED_TARGETS: Record<string, { target: string; rewrite: (path: string) => string }> = {
  '/api/auth-proxy': {
    target: 'https://login.microsoftonline.com',
    rewrite: (p) => p.replace(/^\/api\/auth-proxy/, ''),
  },
  '/api/github-oauth/device/code': {
    target: 'https://github.com',
    rewrite: () => '/login/device/code',
  },
  '/api/github-oauth/access_token': {
    target: 'https://github.com',
    rewrite: () => '/login/oauth/access_token',
  },
  '/api/pricing-proxy': {
    target: 'https://prices.azure.com',
    rewrite: (p) => p.replace(/^\/api\/pricing-proxy/, ''),
  },
  '/api/gflights-proxy': {
    target: 'https://www.google.com',
    rewrite: (p) => {
      const stripped = p
        .replace(/^\/api\/gflights-proxy\/?/, '')
        .replace(/^https:\/\/www\.google\.com/, '');
      if (!stripped) {
        return '';
      }
      return stripped.charAt(0) === '/' ? stripped : '/' + stripped;
    },
  },
};

/** Find the matching target for a request path. */
function matchTarget(pathname: string) {
  // Sort by longest prefix first for specificity
  const prefixes = Object.keys(ALLOWED_TARGETS).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (pathname === prefix || pathname.startsWith(prefix + '/') || pathname.startsWith(prefix + '?')) {
      return { config: ALLOWED_TARGETS[prefix], prefix };
    }
  }
  return null;
}

// Headers to strip from the proxied response (hop-by-hop)
const HOP_HEADERS = new Set([
  'transfer-encoding', 'connection', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailer', 'upgrade',
  // Node fetch auto-decompresses — strip encoding headers so the browser
  // doesn't try to decompress the already-decompressed body
  'content-encoding', 'content-length',
]);

async function proxyHandler(request: HttpRequest): Promise<HttpResponseInit> {
  const url = new URL(request.url);

  // ─── LLM proxy routes ───
  if (url.pathname === '/api/llm-proxy/models') {
    return llmModelsHandler(request);
  }
  if (url.pathname === '/api/llm-proxy') {
    return llmProxyChatHandler(request);
  }

  // ─── Google Maps API key ───
  if (url.pathname === '/api/gmaps-key') {
    const gmapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!gmapsKey) {
      return { status: 503, jsonBody: { error: 'Google Maps API key not configured' } };
    }
    return { status: 200, jsonBody: { apiKey: gmapsKey }, headers: { 'Content-Type': 'application/json' } };
  }

  // ─── Bicep compile ───
  if (url.pathname === '/api/bicep-compile' && request.method === 'POST') {
    return bicepCompileHandler(request);
  }

  // ─── CORS proxy routes ───
  const match = matchTarget(url.pathname);

  if (!match) {
    return { status: 404, body: 'Unknown proxy route' };
  }

  const rewrittenPath = match.config.rewrite(url.pathname);
  const targetUrl = match.config.target + rewrittenPath + url.search;

  // Forward the request
  const headers: Record<string, string> = {};
  request.headers.forEach((value: string, key: string) => {
    const lower = key.toLowerCase();
    if (lower !== 'host' && lower !== 'origin' && lower !== 'referer' && !HOP_HEADERS.has(lower)) {
      headers[key] = value;
    }
  });

  const body = request.method !== 'GET' && request.method !== 'HEAD'
    ? await request.text()
    : undefined;

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
  });

  // Build response, stripping hop-by-hop headers
  const responseHeaders: Record<string, string> = {};
  upstream.headers.forEach((value: string, key: string) => {
    if (!HOP_HEADERS.has(key.toLowerCase())) {
      responseHeaders[key] = value;
    }
  });

  const responseBody = await upstream.arrayBuffer();

  return {
    status: upstream.status,
    headers: responseHeaders,
    body: new Uint8Array(responseBody),
  };
}

// Register a catch-all for all proxy routes under /api/*
// SWA routes /api/* to the linked Functions app automatically
app.http('proxy', {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: '{*proxyPath}',
  handler: proxyHandler,
});
