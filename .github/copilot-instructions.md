# Adaptive UI — Workspace Instructions

## Project Overview

Adaptive UI is a React + TypeScript framework for building conversational, AI-agent-driven UIs powered by LLMs. The project is split across multiple repos managed as git submodules.

## Repository Layout

```
adaptive-ui/                            # Parent workspace (this repo)
├── adaptive-ui-framework/              # Core framework: renderer, components, LLM adapter
│   └── packs/core/                     # @sabbour/adaptive-ui-core
├── demos/
│   ├── adaptive-ui-solution-architect/ # AI Solution Architect coworker app
│   └── adaptive-ui-trip-notebook/      # AI Travel Notebook trip planning app
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
- Commits use `user.name="Ahmed Sabbour"` and `user.email="sabbour@outlook.com"`.
