# Adaptive UI — Workspace Instructions

## Project Overview

Adaptive UI is a React + TypeScript framework for building conversational, AI-agent-driven UIs powered by LLMs. The project is split across multiple repos managed as git submodules.

## Repository Layout

```
adaptive-ui/                            # Parent workspace (this repo)
├── adaptive-ui-framework/              # Core framework: renderer, components, LLM adapter
│   └── packs/core/                     # @sabbour/adaptive-ui-core
├── api/                                # Azure Functions API proxy (CORS bypass for all packs)
├── demos/
│   ├── adaptive-ui-solution-architect/ # AI Solution Architect coworker app
│   ├── adaptive-ui-trip-notebook/      # AI Travel Notebook trip planning app
│   └── adaptive-ui-try-aks/            # Deploy on AKS deployment experience
└── packs/
    ├── adaptive-ui-azure-pack/         # @sabbour/adaptive-ui-azure-pack
    ├── adaptive-ui-github-pack/        # @sabbour/adaptive-ui-github-pack
    ├── adaptive-ui-google-flights-pack/# @sabbour/adaptive-ui-google-flights-pack
    ├── adaptive-ui-google-maps-pack/   # @sabbour/adaptive-ui-google-maps-pack
    └── adaptive-ui-travel-data-pack/   # @sabbour/adaptive-ui-travel-data-pack
```

Each subdirectory is a **separate git repo** (submodule). They are independently versioned, built, and published.

## Package Resolution

- Packs and demos install `@sabbour/adaptive-ui-core` and other packs as npm packages from **GitHub Packages**.
- All repos have `.npmrc` with `@sabbour:registry=https://npm.pkg.github.com`.
- For **local development**, use `npm link` to symlink local checkouts:
  ```bash
  cd packs/adaptive-ui-azure-pack && npm link
  cd adaptive-ui-framework && npm run link:packs
  ```

## Conventions

- **ES2020 target** — no `String.replaceAll()`, `Array.at()`, `Object.hasOwn()`. Use `split().join()`.
- **`React.createElement()`** — all framework and pack code uses createElement, not JSX.
- **Sensitive state keys** start with `__` — filtered from LLM context, redacted in URL interpolation.
- **API keys** go in `localStorage` with module-level getters, never in adaptive state.

## Git Workflow

- Each repo has its own CI workflow (`.github/workflows/ci.yml`).
- Packs publish to GitHub Packages via `publish.yml` on `v*` tags.
- The parent workspace deploys to Azure Static Web Apps via `deploy-swa.yml`.
- The `api/` folder is deployed as the SWA managed Functions backend (CORS proxy).
- Commits use `user.name="Ahmed Sabbour"` and `user.email="sabbour@outlook.com"`.

## API Proxy (CORS)

All external API calls that hit CORS (Azure ARM auth, GitHub OAuth, Azure pricing, Google Flights) go through an **Azure Functions proxy** in `api/`.

- All pack code uses `/api/` prefixed paths (e.g., `/api/auth-proxy`, `/api/github-oauth/device/code`, `/api/pricing-proxy`, `/api/gflights-proxy`).
- **Local dev**: Vite proxies `/api` → `http://localhost:7071` (Azure Functions dev server).
- **Production**: SWA natively routes `/api/*` to the managed Functions backend.
- `start-app.sh` automatically starts both the Functions backend and the Vite dev server.

## Local Development

```bash
# Full build (framework → packs → api → demos)
bash build-all.sh

# Start a demo (API backend starts automatically)
bash start-app.sh try-aks
bash start-app.sh solution-architect
bash start-app.sh trip-notebook
```
