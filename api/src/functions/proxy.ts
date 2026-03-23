import { app, HttpRequest, HttpResponseInit } from '@azure/functions';

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
    rewrite: (p) => p.replace(/^\/api\/gflights-proxy/, ''),
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
]);

async function proxyHandler(request: HttpRequest): Promise<HttpResponseInit> {
  const url = new URL(request.url);
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
