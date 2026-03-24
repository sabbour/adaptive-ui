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
- Commits should use the developer's configured local git identity (`git config user.name`, `git config user.email`).

## Publishing & Version Coordination

All packages are published to **GitHub Packages** (`@sabbour` scope). Versions must be coordinated because packs declare `@sabbour/adaptive-ui-core` as a `peerDependency`.

**Dependency chain**: `adaptive-ui-core` → packs (azure, github, flights, maps, travel-data) → demo apps.

**Automated publishing** — use the coordinated control-plane command:
```bash
# Bump all packages (patch/minor/major), publish, update deps
npm run release -- patch
npm run release -- minor
```

**Contract validation** — run before integration/deploy:
```bash
npm run contract
```

**Submodule pointer synchronization** — update and open PR from parent workspace:
```bash
npm run sync -- --create-pr
```

The script handles the full sequence:
1. Bumps `@sabbour/adaptive-ui-core` version, tags, pushes → triggers publish workflow
2. Waits for the package to appear on GitHub Packages
3. Bumps all 5 packs with updated `peerDependencies`, tags, pushes → triggers publish
4. Waits for all packs to publish
5. Updates demo app `package.json` dependencies, commits, pushes
6. Updates parent workspace submodule pointers

**Manual publishing** — if you need to publish a single package:
1. Bump `version` in `package.json`
2. If it's a pack, also update `peerDependencies["@sabbour/adaptive-ui-core"]` to match the published core version
3. Commit, tag with `v<version>`, push with `--tags`
4. The `publish.yml` workflow triggers on `v*` tags
5. After publishing, update any downstream `package.json` files that reference the package

**Common issue**: `ERESOLVE` peer dependency conflict in CI — means a pack's `peerDependencies` version doesn't match the installed core version. Fix by publishing the pack with an updated peer dep range. Demo CI workflows use `--legacy-peer-deps` as a safety net.

**Never re-publish an existing version** — GitHub Packages returns 409 Conflict. Always bump the version number.

## API Proxy (CORS)

All external API calls that hit CORS (Azure ARM auth, GitHub OAuth, Azure pricing, Google Flights) go through an **Azure Functions proxy** in `api/`.

- All pack code uses `/api/` prefixed paths (e.g., `/api/auth-proxy`, `/api/github-oauth/device/code`, `/api/pricing-proxy`, `/api/gflights-proxy`).
- **Local dev**: Vite proxies `/api` → `http://localhost:7071` (Azure Functions dev server).
- **Production**: SWA natively routes `/api/*` to the managed Functions backend.
- `npm run start -- <app-name>` automatically starts both the Functions backend and the Vite dev server.

## Local Development

```bash
# Full build (framework → packs → api → demos)
npm run build

# Start a demo (API backend starts automatically)
npm run start -- try-aks
npm run start -- solution-architect
npm run start -- trip-notebook
```

## Agent Runbook (Control Plane)

The workspace automation entrypoint is `tooling/workspacectl.mjs` with manifest `tooling/workspace-manifest.yaml`.

When operating in this workspace, use this order:

1. `npm run doctor` — environment/auth/branch/dirty checks
2. `npm run contract` — cross-repo dependency contract validation
3. `npm run build` — full build

Use these commands by scenario:

- Local app dev: `npm run start -- <app-name>`
- Coordinated release preview: `npm run release -- patch --dry-run`
- Coordinated release: `npm run release -- <patch|minor|major>`
- Submodule sync preview: `npm run sync -- --dry-run --create-pr`
- Submodule sync PR: `npm run sync -- --create-pr`
- SWA provisioning: `npm run provision -- --name <name> --resource-group <rg> --location <region>`

## Prompt Catalog (Agent-Facing)

Use these workspace prompts in `.github/prompts/`:

- `workspace-router.prompt.md` — routes ambiguous workspace intents to the right operational prompt.
- `workspace-ops.prompt.md` — maps user intent to doctor/contract/build/start/release/sync/provision commands.
- `workspace-warning-cleanup.prompt.md` — handles doctor warning triage and pre-release/pre-sync cleanup.
- `workspace-release-checklist.prompt.md` — enforces a go/no-go release checklist with preview-first execution rules.
