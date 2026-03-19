---
description: "Scaffold a new demo app: standalone directory with pack registration, system prompt, side panel, build/start integration, and all config files."
argument-hint: "App name and purpose, e.g. 'recipe-book — AI cooking assistant that helps plan meals and manage recipes'"
agent: "agent"
tools: [read, edit, search, execute]
---

Scaffold a new demo app for the Adaptive UI framework.

Use the existing demo apps as reference implementations:
- **Trip Notebook** — `demos/adaptive-ui-trip-notebook/` (consumer app with right-side panel)
- **Solution Architect** — `demos/adaptive-ui-solution-architect/` (enterprise app with file viewer panel)

## Input

The user provides: `$input` (app name and purpose description).

Parse the input to determine:
- **APP_SLUG**: kebab-case name (e.g. `recipe-book`)
- **APP_DIR**: `adaptive-ui-$APP_SLUG` (e.g. `adaptive-ui-recipe-book`)
- **APP_LABEL**: human-readable title (e.g. `Recipe Book`)
- **PURPOSE**: what the app does (to generate system prompt and initial greeting)

## Task

Create a new app directory at `demos/adaptive-ui-$APP_SLUG/` with the following files, then integrate it into the workspace build and start scripts.

### 1. `demos/adaptive-ui-$APP_SLUG/package.json`

```json
{
  "name": "@sabbour/adaptive-ui-$APP_SLUG",
  "version": "0.1.0",
  "private": true,
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "link:packs": "npm link @sabbour/adaptive-ui-core <plus any pack dependencies>",
    "unlink:packs": "npm unlink @sabbour/adaptive-ui-core <plus any pack dependencies> && npm install"
  },
  "dependencies": {
    "@sabbour/adaptive-ui-core": "^0.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "~5.6.2",
    "vite": "^6.0.0"
  }
}
```

Add any `@sabbour/adaptive-ui-*-pack` dependencies to `dependencies` that the app needs. Choose packs based on the app's PURPOSE (e.g. a travel app needs google-maps-pack, an enterprise app needs azure-pack).

### 2. `demos/adaptive-ui-$APP_SLUG/.npmrc`

```
@sabbour:registry=https://npm.pkg.github.com
```

### 3. `demos/adaptive-ui-$APP_SLUG/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": "."
  },
  "include": ["src"]
}
```

### 4. `demos/adaptive-ui-$APP_SLUG/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    open: true,
    // Add proxy rules if any registered packs need them:
    // - Azure pack needs /auth-proxy → https://login.microsoftonline.com
    // - GitHub pack needs /github-oauth/* → https://github.com
    // - Google Flights pack needs /gflights-proxy → https://www.google.com
  },
});
```

Add proxy rules matching the packs used. Copy proxy configs from the reference apps.

### 5. `demos/adaptive-ui-$APP_SLUG/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https:; font-src 'self' https:;" />
    <title>$APP_LABEL</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 6. `demos/adaptive-ui-$APP_SLUG/src/vite-env.d.ts`

```typescript
/// <reference types="vite/client" />
```

### 7. `demos/adaptive-ui-$APP_SLUG/src/main.tsx`

Entry point — registers packs, imports the app component (which self-registers via `registerApp`), and renders `AppRouter`.

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerPackWithSkills } from '@sabbour/adaptive-ui-core';
// Import pack creators for this app
import '@sabbour/adaptive-ui-core/css/adaptive.css';

// Register packs
// registerPackWithSkills(create___Pack());

// Import the app (self-registers via registerApp)
import './$AppComponent';

import { AppRouter } from '@sabbour/adaptive-ui-core';

ReactDOM.createRoot(document.getElementById('root')!).render(
  React.createElement(React.StrictMode, null,
    React.createElement(AppRouter)
  )
);
```

### 8. `demos/adaptive-ui-$APP_SLUG/src/$AppComponent.tsx`

Main app component. Follow the pattern in the reference apps:

- Use `registerApp()` to self-register
- Use `AdaptiveApp` from core as the main chat UI
- Use `SessionsSidebar` + `ResizeHandle` for session management
- Define the system prompt as a `const` string tailored to PURPOSE
- Define `initialSpec: AdaptiveUISpec` with title, greeting, and initial layout
- Include `ensurePacks()` for lazy pack registration with `clearAllPacks()`/`setActivePackScope()`
- Use `React.createElement()` — NOT JSX (matches framework convention)
- Handle sessions: `generateSessionId`, `saveSession`, `deleteSession`, `setSessionScope`
- Handle artifacts: `upsertArtifact`, `getArtifacts`, `subscribeArtifacts`, `loadArtifactsForSession`, `saveArtifactsForSession`, `deleteArtifactsForSession`, `setArtifactsScope`

The system prompt should follow the pattern:
```
═══ DISCOVERY ═══
Ask about relevant details over 2-3 turns

═══ PLANNING / DESIGN ═══
Domain-specific planning guidance

═══ VISUAL EXPERIENCE ═══
How to use available components

═══ WORKFLOW ═══
Step-by-step agent behavior
```

Optionally include a CSS theme file at `src/css/$APP_SLUG-theme.css` if the app needs custom styling.

## Build & Start Integration

After creating the app files, update these workspace-level scripts:

### 9. Update `build-all.sh`

Add a new section in the `# ── 3. Demos ──` area, before the `# ── Done ──` block. Use links-before-install pattern:

```bash
echo ""
echo "=== adaptive-ui-$APP_SLUG ==="
cd "$BASE/demos/adaptive-ui-$APP_SLUG"
npm link @sabbour/adaptive-ui-core <plus any pack dependencies>
npm install --legacy-peer-deps
npm link @sabbour/adaptive-ui-core <plus any pack dependencies>
npx tsc -b
npx vite build
echo "✓ $APP_SLUG build passed"
```

The `npm link` lines must list `@sabbour/adaptive-ui-core` plus every `@sabbour/adaptive-ui-*-pack` in the app's `dependencies`. The link is done BEFORE and AFTER `npm install` because:
- Before: prevents npm from trying to fetch unpublished packages from the registry
- After: `npm install` may overwrite the symlinks

### 10. Update `start-app.sh`

Add a new entry to the `APPS` array:

```bash
"$APP_SLUG:demos/adaptive-ui-$APP_SLUG"
```

### 11. Update `.vscode/tasks.json` (via `adaptive-ui.code-workspace`)

Add a new task in `adaptive-ui.code-workspace`:

```json
{
  "label": "Start: $APP_LABEL",
  "type": "shell",
  "command": "bash start-app.sh $APP_SLUG",
  "isBackground": true
}
```

And a launch configuration:

```json
{
  "name": "Launch: $APP_LABEL",
  "type": "chrome",
  "request": "launch",
  "url": "http://localhost:5173",
  "webRoot": "${workspaceFolder}/demos/adaptive-ui-$APP_SLUG/src",
  "preLaunchTask": "Start: $APP_LABEL"
}
```

## Constraints

- Target **ES2020** — no `String.replaceAll()`, `Array.at()`, `Object.hasOwn()`. Use `split().join()`.
- Use `React.createElement()` — NOT JSX (matches framework convention).
- Sensitive state keys start with `__` — filtered from LLM context.
- API keys go in `localStorage` with module-level getters, never in adaptive state.
- All pack components with `useEffect` API calls MUST guard with `if (disabled) return;`.
- Run the "Build All" task to verify the full workspace builds.
