#!/bin/bash
# commit-push-all.sh — Stage, commit, and push across all repos in the workspace.
# Usage: bash scripts/commit-push-all.sh "commit message"

set -e

BASE="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "$1" ]; then
  echo "Usage: $0 \"commit message\""
  exit 1
fi

MSG="$1"

REPOS=(
  adaptive-ui-framework
  packs/adaptive-ui-azure-pack
  packs/adaptive-ui-github-pack
  packs/adaptive-ui-google-flights-pack
  packs/adaptive-ui-google-maps-pack
  packs/adaptive-ui-travel-data-pack
  demos/adaptive-ui-solution-architect
  demos/adaptive-ui-trip-notebook
  demos/adaptive-ui-try-aks
  .
)

for repo in "${REPOS[@]}"; do
  dir="$BASE/$repo"
  echo ""
  echo "=== $repo ==="

  if [ ! -d "$dir/.git" ] && [ ! -f "$dir/.git" ]; then
    echo "  ⚠ Not a git repo, skipping"
    continue
  fi

  cd "$dir"

  # Check for changes (staged + unstaged + untracked)
  if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    echo "  ✓ Clean — nothing to commit"
    continue
  fi

  git add -A
  echo "  Staged changes:"
  git --no-pager diff --cached --stat

  git commit -m "$MSG"
  echo "  ✓ Committed"

  git push
  echo "  ✓ Pushed"
done

echo ""
echo "Done."
