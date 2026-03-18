# Adaptive UI

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
├── demos/
│   ├── adaptive-ui-solution-architect/  # AI Solution Architect coworker app
│   └── adaptive-ui-trip-notebook/       # AI Travel Notebook trip planning app
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

## Local Development

Each pack is its own npm package published to GitHub Packages. For local development across repos, use `npm link`:

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
