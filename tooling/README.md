# Workspace Tooling

This folder contains reusable workspace automation for multi-repo projects.

## Files

- workspace-manifest.yaml: single source of truth for repo graph, build order, and release order.
- workspacectl.mjs: command-line tool that drives doctor, contract, build, start, release, sync, and provision flows.

## Command Runbook

Run these from the parent workspace root.

1. Initial or daily checks
- npm run doctor
- npm run contract

2. Build and run local apps
- npm run build
- npm run start -- trip-notebook
- npm run start -- solution-architect
- npm run start -- try-aks

3. Release process
- npm run release -- patch --dry-run
- npm run release -- patch

4. Submodule pointer sync
- npm run sync -- --dry-run --create-pr
- npm run sync -- --create-pr

5. Infrastructure provisioning
- npm run provision -- --name <name> --resource-group <rg> --location <region>

## Doctor Warning Cleanup

Use this checklist after `npm run doctor` if warnings are present.

1. Confirm whether warnings block your next action
- For local development only: dirty-tree warnings can be tolerated.
- For release and `sync --create-pr`: clean state is required.

2. Clean each flagged repository

```bash
git status
git add -A && git commit -m "wip: local changes"
# or: git stash -u
```

3. Verify branch

```bash
git checkout main
```

4. Re-check gates

```bash
npm run doctor
npm run contract
```

5. Continue

```bash
npm run release -- patch
# or
npm run sync -- --create-pr
```

## Notes

- sync --create-pr opens the PR in the parent workspace repository (adaptive-ui), not in child submodule repositories.
- release is strict by design: it requires clean working trees and main branches for coordinated repos.

## Agent Prompts

Workspace prompt assets are available in `.github/prompts/`:

- `workspace-router.prompt.md`: routes user intent to the right operational prompt.
- `workspace-ops.prompt.md`: maps user intent to the correct control-plane command sequence.
- `workspace-warning-cleanup.prompt.md`: triages and cleans doctor warnings before coordinated operations.
- `workspace-release-checklist.prompt.md`: runs a release go/no-go checklist with dry-run first.
