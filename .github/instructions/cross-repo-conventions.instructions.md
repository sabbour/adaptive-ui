---
applyTo: "**/*.ts,**/*.tsx"
description: "Cross-repo conventions for pack development, tool/picker/query patterns, and system prompt design."
---

# Adaptive UI — Cross-Repo Conventions

## Tools vs Components vs Pickers

- **Tools** = read-only queries the LLM calls during inference (before generating UI). Use ONLY when the LLM needs to SEE the data to make decisions.
- **Picker components** = client-side dropdowns that fetch and display API data at render time. The LLM never sees the data. Use for ANY selection list. Always auto-paginate.
- **Query components** = client-side API callers for write operations with user confirmation. Use for POST/PUT/DELETE mutations only.
- **Tool descriptions must NOT mention listing for selection.** If a tool's description says "list repos/regions/SKUs", the LLM will call it instead of using the picker.
- **ANTI-PATTERN: Using tools to fetch lists for selection.** Use a picker component instead — data stays client-side, zero token cost.
- **ANTI-PATTERN: Using query components for reads.** Query components store results in state but the LLM never sees that data.
- **Pack system prompts must clearly separate all three.** State which operations use tools, pickers, and query components.

## Disabled Context (Past Turns)

- Past turns render inside a `DisabledScope` where `useAdaptive().disabled === true`.
- **All pack components with `useEffect` API calls MUST guard with `if (disabled) return;`** at the top of the effect.
- The component still renders visually — only side effects are suppressed.

## System Prompt Design

- **Base prompts must be cloud-agnostic.** Never hardcode provider-specific services in the framework system prompt. Use generic terms.
- **Provider-specific guidance belongs in pack system prompts.** Azure-specific IaC (Bicep), diagram icons, CLI commands go in the Azure pack's `AZURE_SYSTEM_PROMPT`.
- **In Adaptive mode, the LLM follows the pack system prompt directly.** Document picker components with full prop examples.
- Components belong in `"ask"`, NEVER in `"show"`. Show is display-only.

## Pack Registration & Settings

- `visiblePacks` controls settings panel visibility. If you register a pack but don't add its name to `visiblePacks`, its settings UI won't appear.
- Self-managed components (login cards) must render their own Continue button using `sendPrompt()` from `useAdaptive()`.

## State & Sensitive Keys

- `__`-prefixed keys are filtered from the LLM context.
- `interpolate()` redacts `__`-prefixed keys by default. Pack components using `{{state.__key}}` in API paths must pass `{ allowSensitive: true }` to `interpolate()`.
- API keys/credentials belong in `localStorage` with module-level getters, never in adaptive state.

## Token Management

- `max_completion_tokens` defaults to 16384. Diagrams can consume 300-500 output tokens.
- Only include diagrams when the architecture changes — not on every step.

## API Proxy (CORS)

- All external API calls that hit CORS go through the Azure Functions proxy in `api/`.
- Pack code MUST use `/api/` prefixed paths, never direct external URLs.
- Proxy routes: `/api/auth-proxy` (Azure AD), `/api/github-oauth/*` (GitHub OAuth), `/api/pricing-proxy` (Azure pricing), `/api/gflights-proxy` (Google Flights).
- The proxy function in `api/src/functions/proxy.ts` has an allowlist of targets — no open redirect.
- **Local dev**: Vite proxies `/api` → `http://localhost:7071` (Azure Functions dev server).
- **Production**: SWA natively routes `/api/*` to the managed Functions backend.
- When adding a new external API that needs CORS bypass, add a target to the proxy allowlist AND update the Vite config is NOT needed (single `/api` proxy handles all routes).

## GitHub Pack — Personal vs Org Accounts

- The `githubPicker` stores `__githubOrgIsPersonal: 'true'` when a personal account is selected.
- The `githubQuery` component auto-rewrites `POST /orgs/<user>/repos` → `POST /user/repos` for personal accounts.

## LLM System Prompt & Component Registry

The LLM only knows about components that are documented in the system prompt. When adding or modifying components:

- **Built-in components** are documented in `ADAPTIVE_UI_SYSTEM_PROMPT` in `adaptive-ui-framework/packs/core/src/llm-adapter.ts` under the "Component types:" section. Every built-in component registered in `registerBuiltinComponents()` in `builtins.tsx` MUST have a corresponding entry in this prompt. If you add a new built-in component, add it to the prompt too.
- **Pack components** are documented in each pack's `systemPrompt` string (e.g., `AZURE_SYSTEM_PROMPT` in the Azure pack's `index.ts`, `GITHUB_SYSTEM_PROMPT` in the GitHub pack's `index.ts`). When adding a new pack component, document it in the pack's system prompt with full prop examples.
- **Component format in the prompt**: `componentName(prop1,prop2?:default,prop3?:[{label,value}] — brief description of what it does)`
- **Selection rules to include**: When to use `select` vs `combobox` vs `radioGroup` vs `questionnaire` — document thresholds (e.g., ≤5 options → radioGroup; ≥6 → select/combobox; multi-step intake → questionnaire).
