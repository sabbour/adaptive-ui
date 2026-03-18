---
description: "Scaffold a new component pack repo: standalone directory with createXPack() function, system prompt, components, CI/CD workflows, and npm config."
argument-hint: "Pack name and domain, e.g. 'spotify — music player with playlist browsing and track preview'"
agent: "agent"
tools: [read, edit, search, execute]
---

Scaffold a new standalone component pack repo for the Adaptive UI framework.

Use the Azure pack repo ([sabbour/adaptive-ui-azure-pack](https://github.com/sabbour/adaptive-ui-azure-pack)) as the reference implementation.

## Task

Create a new pack repo named **adaptive-ui-$input** with the following files:

### 1. `src/index.ts`

```typescript
import type { ComponentPack } from '@sabbour/adaptive-ui-core';
// Import your components, settings, skills resolver, and CSS

const SYSTEM_PROMPT = `
<PACK_NAME> PACK:

TOOLS (inference-time, LLM sees results):
- tool_name: Description. Do NOT use for selection lists — use myPicker instead.

COMPONENTS (use in "ask" as {type:"component",component:"name",props:{}}):

myPicker — {api, bind, label?, ...}
  Client-side dropdown. LLM never sees data. Use for ALL selection lists.

myQuery — {api, bind, method?, body?, confirm?}
  API caller for writes with user confirmation.

WHEN TO USE:
- Tool: LLM needs data to make decisions
- Picker component: user picks from a list
- Query component: write operation with confirmation
`;

export function create<Name>Pack(): ComponentPack {
  return {
    name: '<name>',
    displayName: '<Display Name>',
    components: {
      // componentKey: ComponentFunction,
    },
    systemPrompt: SYSTEM_PROMPT,
    // resolveSkills: resolveSkillsFn,       // optional
    // settingsComponent: SettingsComponent,  // optional
    // intentResolvers: { ... },             // optional
    // tools: [ ... ],                       // optional
  };
}
```

### 2. `src/components.tsx`

- Define node interfaces extending `AdaptiveNodeBase` with literal `type` fields
- Implement components using `React.createElement()` (no JSX)
- Use `useAdaptive()` for state/dispatch
- Use `trackedFetch()` for external API calls
- Prefix sensitive state keys with `__`
- Guard all `useEffect` API calls with `if (disabled) return;`

### 3. `package.json`

```json
{
  "name": "@sabbour/adaptive-ui-<name>-pack",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "publishConfig": { "registry": "https://npm.pkg.github.com" },
  "scripts": { "build": "tsc -b --noEmit" },
  "peerDependencies": {
    "@sabbour/adaptive-ui-core": "^0.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/sabbour/adaptive-ui-<name>-pack.git"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "typescript": "~5.6.2",
    "vite": "^6.0.0"
  }
}
```

### 4. Other config files

- `tsconfig.json` — standalone (ES2020 target, composite, jsx: react-jsx)
- `.npmrc` — `@sabbour:registry=https://npm.pkg.github.com`
- `.github/workflows/ci.yml` — build on push/PR to main
- `.github/workflows/publish.yml` — publish on `v*` tags

### 5. Register in the consuming app

Install the pack and register it:

```typescript
import { registerPackWithSkills } from '@sabbour/adaptive-ui-core';
import { create<Name>Pack } from '@sabbour/adaptive-ui-<name>-pack';

registerPackWithSkills(create<Name>Pack());
```

### 6. Optional files

- `src/skills-resolver.ts` — keyword-triggered knowledge fetching
- `src/css/<name>-theme.css` — custom CSS tokens
- `src/<Name>Settings.tsx` — settings panel UI

## Constraints

- Use `React.createElement()`, not JSX (matches existing pack style)
- Use `trackedFetch()` from `@sabbour/adaptive-ui-core` for API calls
- Prefix internal/secret state keys with `__`
- Document all components in the system prompt following the three-tier pattern (tools, pickers, queries)
- Run `npm run build` to verify compilation
