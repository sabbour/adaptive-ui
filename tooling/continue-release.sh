#!/bin/bash
set -e

BASE="/mnt/c/Users/asabbour/Git/adaptive-ui"
CORE_VERSION="1.1.3"

PACKS=(
  adaptive-ui-azure-pack
  adaptive-ui-github-pack
  adaptive-ui-google-flights-pack
  adaptive-ui-google-maps-pack
  adaptive-ui-travel-data-pack
)

echo "=== Phase 1: Bump and push packs ==="
for pack in "${PACKS[@]}"; do
  echo "--- Processing $pack ---"
  cd "$BASE/packs/$pack"
  npm version patch --no-git-tag-version
  NEW_VER=$(node -p "require('./package.json').version")
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    if (p.peerDependencies && p.peerDependencies['@sabbour/adaptive-ui-core']) {
      p.peerDependencies['@sabbour/adaptive-ui-core'] = '^${CORE_VERSION}';
    }
    fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
  "
  git add -A
  git commit -m "chore: bump to ${NEW_VER}, core peer dep ^${CORE_VERSION}"
  git tag "v${NEW_VER}"
  git push origin main --tags
  echo "=== Done $pack v${NEW_VER} ==="
done

echo ""
echo "=== Phase 2: Wait for pack publish workflows ==="
for pack in "${PACKS[@]}"; do
  cd "$BASE/packs/$pack"
  NEW_VER=$(node -p "require('./package.json').version")
  echo "Checking publish workflow for sabbour/$pack v${NEW_VER}..."
  gh run list --repo "sabbour/$pack" --limit 1
done

echo ""
echo "=== Phase 3: Update demo deps ==="

# Try AKS
cd "$BASE/demos/adaptive-ui-try-aks"
AZURE_VER=$(node -p "require('$BASE/packs/adaptive-ui-azure-pack/package.json').version")
GITHUB_VER=$(node -p "require('$BASE/packs/adaptive-ui-github-pack/package.json').version")
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  p.dependencies['@sabbour/adaptive-ui-core'] = '^${CORE_VERSION}';
  p.dependencies['@sabbour/adaptive-ui-azure-pack'] = '^${AZURE_VER}';
  p.dependencies['@sabbour/adaptive-ui-github-pack'] = '^${GITHUB_VER}';
  fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
"
git add -A
git commit -m "chore: update deps core ${CORE_VERSION}"
git push origin main
echo "=== Done adaptive-ui-try-aks ==="

# Solution Architect
cd "$BASE/demos/adaptive-ui-solution-architect"
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  p.dependencies['@sabbour/adaptive-ui-core'] = '^${CORE_VERSION}';
  p.dependencies['@sabbour/adaptive-ui-azure-pack'] = '^${AZURE_VER}';
  p.dependencies['@sabbour/adaptive-ui-github-pack'] = '^${GITHUB_VER}';
  fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
"
git add -A
git commit -m "chore: update deps core ${CORE_VERSION}"
git push origin main
echo "=== Done adaptive-ui-solution-architect ==="

# Trip Notebook
cd "$BASE/demos/adaptive-ui-trip-notebook"
FLIGHTS_VER=$(node -p "require('$BASE/packs/adaptive-ui-google-flights-pack/package.json').version")
MAPS_VER=$(node -p "require('$BASE/packs/adaptive-ui-google-maps-pack/package.json').version")
TRAVEL_VER=$(node -p "require('$BASE/packs/adaptive-ui-travel-data-pack/package.json').version")
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  p.dependencies['@sabbour/adaptive-ui-core'] = '^${CORE_VERSION}';
  p.dependencies['@sabbour/adaptive-ui-google-flights-pack'] = '^${FLIGHTS_VER}';
  p.dependencies['@sabbour/adaptive-ui-google-maps-pack'] = '^${MAPS_VER}';
  p.dependencies['@sabbour/adaptive-ui-travel-data-pack'] = '^${TRAVEL_VER}';
  fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
"
git add -A
git commit -m "chore: update deps core ${CORE_VERSION}"
git push origin main
echo "=== Done adaptive-ui-trip-notebook ==="

echo ""
echo "=== Phase 4: Update parent submodule pointers ==="
cd "$BASE"
git add -A
git commit -m "chore: update submodules after patch bump to core ${CORE_VERSION}"
git push origin main
echo ""
echo "=== Release flow completed ==="
