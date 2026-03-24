# Adaptive UI

<p align="left">
  <img src="assets/logo.svg" alt="Adaptive UI" width="480" />
</p>

[![Integration Build](https://github.com/sabbour/adaptive-ui/actions/workflows/integration.yml/badge.svg)](https://github.com/sabbour/adaptive-ui/actions/workflows/integration.yml)
[![Deploy](https://github.com/sabbour/adaptive-ui/actions/workflows/deploy-swa.yml/badge.svg)](https://github.com/sabbour/adaptive-ui/actions/workflows/deploy-swa.yml)

Parent workspace for the Adaptive UI project. Uses git submodules to bring together the framework, extension packs, and demo apps.

## Quick Start

```bash
git clone --recurse-submodules https://github.com/sabbour/adaptive-ui.git
cd adaptive-ui
```

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

## Repository Structure

```
adaptive-ui/
├── adaptive-ui-framework/          # Core framework + built-in components
│   └── packs/core/                 # @sabbour/adaptive-ui-core
├── api/                            # Azure Functions API proxy (CORS bypass)
├── demos/
│   ├── adaptive-ui-solution-architect/  # AI Solution Architect coworker app
│   ├── adaptive-ui-trip-notebook/       # AI Travel Notebook trip planning app
│   └── adaptive-ui-try-aks/             # Deploy on AKS deployment experience
└── packs/
    ├── adaptive-ui-azure-pack/     # Azure cloud pack (ARM, MSAL, Bicep)
    ├── adaptive-ui-github-pack/    # GitHub pack (OAuth, repos, PRs)
    ├── adaptive-ui-google-flights-pack/  # Google Flights search
    ├── adaptive-ui-google-maps-pack/     # Google Maps + Places
    └── adaptive-ui-travel-data-pack/     # Weather, currency, country info
```

## Repositories

| Repo | Package | Description |
|------|---------|-------------|
| [adaptive-ui-framework](https://github.com/sabbour/adaptive-ui-framework) | `@sabbour/adaptive-ui-core` | Core framework: renderer, components, LLM adapter |
| [adaptive-ui-azure-pack](https://github.com/sabbour/adaptive-ui-azure-pack) | `@sabbour/adaptive-ui-azure-pack` | Azure cloud integration |
| [adaptive-ui-github-pack](https://github.com/sabbour/adaptive-ui-github-pack) | `@sabbour/adaptive-ui-github-pack` | GitHub integration |
| [adaptive-ui-google-flights-pack](https://github.com/sabbour/adaptive-ui-google-flights-pack) | `@sabbour/adaptive-ui-google-flights-pack` | Flight search |
| [adaptive-ui-google-maps-pack](https://github.com/sabbour/adaptive-ui-google-maps-pack) | `@sabbour/adaptive-ui-google-maps-pack` | Maps + Places |
| [adaptive-ui-travel-data-pack](https://github.com/sabbour/adaptive-ui-travel-data-pack) | `@sabbour/adaptive-ui-travel-data-pack` | Travel data (weather, currency) |
| [adaptive-ui-solution-architect](https://github.com/sabbour/adaptive-ui-solution-architect) | — | Solution Architect demo app |
| [adaptive-ui-trip-notebook](https://github.com/sabbour/adaptive-ui-trip-notebook) | — | Travel Notebook demo app |
| [adaptive-ui-try-aks](https://github.com/sabbour/adaptive-ui-try-aks) | — | Deploy on AKS demo app |

## Local Development

Each pack is its own npm package published to GitHub Packages. For local development across repos, use `npm link`:

```bash
# Full build (framework → packs → api → demos)
npm run build

# Start a demo app (API backend starts automatically)
npm run start -- try-aks
npm run start -- solution-architect
npm run start -- trip-notebook
```

## Workspace Control Plane

The parent repo now includes a lightweight control-plane layer for multi-repo safety:

- `tooling/workspace-manifest.yaml`: declarative repo graph and release order.
- `tooling/workspacectl.mjs`: reusable workspace CLI.

## Which Command To Run

Use this quick map when you are not sure what to run:

| Goal | Command |
|------|---------|
| Check environment, auth, branch/dirty state | `npm run doctor` |
| Validate cross-repo dependency contracts | `npm run contract` |
| Build framework, packs, api, demos | `npm run build` |
| Start one demo plus API backend | `npm run start -- <trip-notebook|solution-architect|try-aks>` |
| Preview release without changing anything | `npm run release -- patch --dry-run` |
| Publish coordinated release | `npm run release -- <patch|minor|major>` |
| Preview submodule sync + PR action | `npm run sync -- --dry-run --create-pr` |
| Sync submodules and open parent PR | `npm run sync -- --create-pr` |
| Provision Static Web App infrastructure | `npm run provision -- --name <name> --resource-group <rg> --location <region>` |

## VS Code Shortcuts

Use `Terminal: Run Task` and pick one of these curated tasks:

- `Doctor`
- `Contract`
- `Build All`
- `Start: Trip Notebook`
- `Start: Solution Architect`
- `Start: Try AKS`
- `Release: Patch Dry Run`
- `Sync: Dry Run`
- `Sync: Create PR`

Use `Run and Debug` launch shortcuts for browser startup:

- `Launch: Trip Notebook`
- `Launch: Solution Architect`
- `Launch: Try AKS`

Run doctor checks:

```bash
npm run doctor
```

Run contract checks before building or deploying:

```bash
npm run contract
```

Use dry-run publishing before real releases:

```bash
npm run release -- patch --dry-run
```

Publish with explicit timeout control:

```bash
npm run release -- patch --max-wait 900
```

Sync submodule pointers and open a PR:

```bash
npm run sync -- --create-pr
```

Preview sync without changes:

```bash
npm run sync -- --dry-run --create-pr
```

## Doctor Warning Cleanup Procedure

Use this procedure when `npm run doctor` reports warnings.

### 1) Decide if warnings block your next step

- Safe to ignore for local experimentation: dirty working tree warnings.
- Must clean before coordinated operations: `release`, `sync --create-pr`, and CI parity checks.

### 2) Identify dirty repositories

```bash
npm run doctor
```

### 3) Clean each dirty repository

From each flagged repository:

```bash
git status
```

Choose one path:

- Commit your changes:

```bash
git add -A
git commit -m "wip: local changes"
```

- Or stash your changes:

```bash
git stash -u
```

- Or discard local changes if intentionally temporary:

```bash
git clean -fd
git restore .
```

### 4) Ensure branch is main for coordinated flows

```bash
git checkout main
```

### 5) Re-run gate checks

```bash
npm run doctor
npm run contract
```

### 6) Proceed with operation

- Release:

```bash
npm run release -- patch
```

- Submodule sync PR:

```bash
npm run sync -- --create-pr
```

### Notes

- The `api` path may appear as a non-git warning depending on workspace layout. This is informational unless you expect `api` to be versioned as an independent repository.
- `sync --create-pr` creates a PR in the parent workspace repository (`adaptive-ui`) only.

Provision Azure Static Web Apps:

```bash
npm run provision -- --name adaptive-ui-apps --resource-group rg-adaptive-ui --location eastus2
```

For linking local packs during development:

```bash
# Register a pack for linking
cd packs/adaptive-ui-azure-pack && npm link

# In the framework or demo, link the local pack
cd adaptive-ui-framework && npm run link:packs
# or
cd demos/adaptive-ui-solution-architect && npm run link:packs

# Restore npm versions when done
npm run unlink:packs
```

## VS Code Workspace

Open `adaptive-ui.code-workspace` to get all repos in a single VS Code window.
