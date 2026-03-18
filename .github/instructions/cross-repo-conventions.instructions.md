---
applyTo: "**/*.ts,**/*.tsx"
description: "Cross-repo conventions for pack development, tool/picker/query patterns, and system prompt design."
---

# Adaptive UI — Cross-Repo Conventions

## Tools vs Components vs Pickers

- **Tools** = read-only queries the LLM calls during inference (before generating UI). Use ONLY when the LLM needs to SEE the data to make decisions.
- **Picker components** = client-side dropdowns that fetch and display API data at render time. The LLM never sees the data. Use for ANY selection list. Always auto-paginate. Always register intent resolvers for common picks.
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
- **Intent resolvers only fire in Intent mode.** In Adaptive mode, the LLM follows the pack system prompt directly. Document picker components with full prop examples.
- `"next"` field in intents must be factual data summaries, NOT agent prose.
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
