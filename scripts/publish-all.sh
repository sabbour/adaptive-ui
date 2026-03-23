#!/bin/bash
set -euo pipefail

# ─── Publish All — Coordinated version bump and publish across all repos ───
#
# Usage:
#   bash scripts/publish-all.sh <bump>
#
# Where <bump> is: patch | minor | major
#
# This script:
#   1. Bumps @sabbour/adaptive-ui-core version
#   2. Tags and pushes to trigger the publish workflow
#   3. Waits for the package to appear on GitHub Packages
#   4. Bumps all packs (azure, github, flights, maps, travel-data) with updated peer dep
#   5. Tags and pushes each pack to trigger publish
#   6. Waits for all packs to publish
#   7. Updates demo app dependencies
#   8. Commits and pushes demos
#
# Prerequisites:
#   - gh CLI authenticated
#   - git configured with push access to all repos
#   - All repos on their default branch (main) with clean working tree

BASE="$(cd "$(dirname "$0")/.." && pwd)"
GIT_USER="Ahmed Sabbour"
GIT_EMAIL="sabbour@outlook.com"

# ─── Helpers ───

log() { echo -e "\033[1;34m→\033[0m $*"; }
ok()  { echo -e "\033[1;32m✓\033[0m $*"; }
err() { echo -e "\033[1;31m✗\033[0m $*" >&2; }

git_commit_tag_push() {
  local dir="$1" msg="$2" tag="$3" branch="${4:-main}"
  cd "$dir"
  git add -A
  git -c user.name="$GIT_USER" -c user.email="$GIT_EMAIL" commit -m "$msg" || { ok "Nothing to commit in $(basename "$dir")"; return 0; }
  git tag "$tag"
  git push origin "$branch" --tags
  ok "Pushed $(basename "$dir") $tag"
}

git_commit_push() {
  local dir="$1" msg="$2" branch="${3:-main}"
  cd "$dir"
  git add -A
  git -c user.name="$GIT_USER" -c user.email="$GIT_EMAIL" commit -m "$msg" || { ok "Nothing to commit in $(basename "$dir")"; return 0; }
  git push origin "$branch"
  ok "Pushed $(basename "$dir")"
}

bump_version() {
  local file="$1" bump="$2"
  local current
  current=$(grep -o '"version": "[^"]*"' "$file" | head -1 | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+')
  local major minor patch
  IFS='.' read -r major minor patch <<< "$current"
  case "$bump" in
    patch) patch=$((patch + 1)) ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    major) major=$((major + 1)); minor=0; patch=0 ;;
    *) err "Unknown bump type: $bump"; exit 1 ;;
  esac
  local new="$major.$minor.$patch"
  sed -i "s/\"version\": \"$current\"/\"version\": \"$new\"/" "$file"
  echo "$new"
}

update_peer_dep() {
  local file="$1" pkg="$2" version="$3"
  sed -i "s|\"$pkg\": \"\\^[0-9]*\\.[0-9]*\\.[0-9]*\"|\"$pkg\": \"^$version\"|g" "$file"
}

update_dep() {
  local file="$1" pkg="$2" version="$3"
  sed -i "s|\"$pkg\": \"\\^[0-9]*\\.[0-9]*\\.[0-9]*\"|\"$pkg\": \"^$version\"|g" "$file"
}

wait_for_package() {
  local pkg="$1" version="$2" max_wait="${3:-120}"
  local registry="https://npm.pkg.github.com"
  local elapsed=0
  log "Waiting for $pkg@$version to appear on GitHub Packages..."
  while [ $elapsed -lt $max_wait ]; do
    # Use npm view to check if the version exists
    if npm view "$pkg@$version" version --registry "$registry" 2>/dev/null | grep -q "$version"; then
      ok "$pkg@$version is published"
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    printf "."
  done
  echo ""
  err "Timed out waiting for $pkg@$version after ${max_wait}s"
  return 1
}

# ─── Parse args ───

BUMP="${1:-}"
if [[ -z "$BUMP" ]]; then
  echo "Usage: bash scripts/publish-all.sh <patch|minor|major>"
  exit 1
fi

# ─── Pre-flight checks ───

log "Checking working trees are clean..."
DIRTY=0
for dir in "$BASE/adaptive-ui-framework" \
           "$BASE/packs/adaptive-ui-azure-pack" \
           "$BASE/packs/adaptive-ui-github-pack" \
           "$BASE/packs/adaptive-ui-google-flights-pack" \
           "$BASE/packs/adaptive-ui-google-maps-pack" \
           "$BASE/packs/adaptive-ui-travel-data-pack" \
           "$BASE/demos/adaptive-ui-try-aks" \
           "$BASE/demos/adaptive-ui-solution-architect" \
           "$BASE/demos/adaptive-ui-trip-notebook"; do
  if [ -n "$(cd "$dir" && git status --porcelain)" ]; then
    err "Dirty working tree: $dir"
    DIRTY=1
  fi
done
if [ $DIRTY -eq 1 ]; then
  err "Commit or stash changes before publishing."
  exit 1
fi

echo ""
echo "========================================="
echo "  Publish All — $BUMP bump"
echo "========================================="

# ─── Step 1: Bump and publish core framework ───

log "Step 1: Bumping @sabbour/adaptive-ui-core ($BUMP)..."
CORE_VERSION=$(bump_version "$BASE/adaptive-ui-framework/packs/core/package.json" "$BUMP")
log "New core version: $CORE_VERSION"
git_commit_tag_push "$BASE/adaptive-ui-framework" "chore: bump to $CORE_VERSION" "v$CORE_VERSION"

# ─── Step 2: Wait for core to publish ───

log "Step 2: Waiting for core package to publish..."
wait_for_package "@sabbour/adaptive-ui-core" "$CORE_VERSION" 180

# ─── Step 3: Bump all packs with updated peer dep ───

log "Step 3: Bumping packs with updated core peer dep..."

PACKS=(
  "adaptive-ui-azure-pack"
  "adaptive-ui-github-pack"
  "adaptive-ui-google-flights-pack"
  "adaptive-ui-google-maps-pack"
  "adaptive-ui-travel-data-pack"
)

declare -A PACK_VERSIONS

for pack in "${PACKS[@]}"; do
  PACK_DIR="$BASE/packs/$pack"
  PACK_PKG="$PACK_DIR/package.json"

  # Bump version
  PACK_VER=$(bump_version "$PACK_PKG" "$BUMP")
  PACK_VERSIONS[$pack]=$PACK_VER

  # Update core peer dep
  update_peer_dep "$PACK_PKG" "@sabbour/adaptive-ui-core" "$CORE_VERSION"

  log "$pack → $PACK_VER (core peer dep ^$CORE_VERSION)"
  git_commit_tag_push "$PACK_DIR" "chore: bump to $PACK_VER, core peer dep ^$CORE_VERSION" "v$PACK_VER"
done

# ─── Step 4: Wait for all packs to publish ───

log "Step 4: Waiting for packs to publish..."
for pack in "${PACKS[@]}"; do
  PACK_VER="${PACK_VERSIONS[$pack]}"
  PKG_NAME="@sabbour/$pack"
  wait_for_package "$PKG_NAME" "$PACK_VER" 180 || true
done

# ─── Step 5: Update demo dependencies ───

log "Step 5: Updating demo dependencies..."

# Try AKS
cd "$BASE/demos/adaptive-ui-try-aks"
update_dep package.json "@sabbour/adaptive-ui-core" "$CORE_VERSION"
update_dep package.json "@sabbour/adaptive-ui-azure-pack" "${PACK_VERSIONS[adaptive-ui-azure-pack]}"
update_dep package.json "@sabbour/adaptive-ui-github-pack" "${PACK_VERSIONS[adaptive-ui-github-pack]}"
git_commit_push "$BASE/demos/adaptive-ui-try-aks" "chore: update deps — core $CORE_VERSION, packs ${PACK_VERSIONS[adaptive-ui-azure-pack]}"

# Solution Architect
cd "$BASE/demos/adaptive-ui-solution-architect"
update_dep package.json "@sabbour/adaptive-ui-core" "$CORE_VERSION"
update_dep package.json "@sabbour/adaptive-ui-azure-pack" "${PACK_VERSIONS[adaptive-ui-azure-pack]}"
update_dep package.json "@sabbour/adaptive-ui-github-pack" "${PACK_VERSIONS[adaptive-ui-github-pack]}"
git_commit_push "$BASE/demos/adaptive-ui-solution-architect" "chore: update deps — core $CORE_VERSION, packs ${PACK_VERSIONS[adaptive-ui-azure-pack]}"

# Trip Notebook
cd "$BASE/demos/adaptive-ui-trip-notebook"
update_dep package.json "@sabbour/adaptive-ui-core" "$CORE_VERSION"
update_dep package.json "@sabbour/adaptive-ui-google-flights-pack" "${PACK_VERSIONS[adaptive-ui-google-flights-pack]}"
update_dep package.json "@sabbour/adaptive-ui-google-maps-pack" "${PACK_VERSIONS[adaptive-ui-google-maps-pack]}"
update_dep package.json "@sabbour/adaptive-ui-travel-data-pack" "${PACK_VERSIONS[adaptive-ui-travel-data-pack]}"
git_commit_push "$BASE/demos/adaptive-ui-trip-notebook" "chore: update deps — core $CORE_VERSION"

# ─── Step 6: Update parent workspace submodule pointers ───

log "Step 6: Updating parent workspace submodule pointers..."
cd "$BASE"
git add -A
git -c user.name="$GIT_USER" -c user.email="$GIT_EMAIL" commit -m "chore: update submodules after $BUMP bump to core $CORE_VERSION" || ok "Parent already up to date"
git push origin main || true

# ─── Done ───

echo ""
echo "========================================="
echo "  All packages published!"
echo "========================================="
echo ""
echo "  Core:   @sabbour/adaptive-ui-core@$CORE_VERSION"
for pack in "${PACKS[@]}"; do
  echo "  Pack:   @sabbour/$pack@${PACK_VERSIONS[$pack]}"
done
echo ""
echo "  Demos updated and pushed."
echo "========================================="
