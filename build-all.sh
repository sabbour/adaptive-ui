#!/bin/bash
set -e

BASE="$(cd "$(dirname "$0")" && pwd)"
export NPM_CONFIG_PREFIX="$BASE/.npm-links"

echo "========================================="
echo "  Adaptive UI — Full Local Build"
echo "========================================="

mkdir -p "$NPM_CONFIG_PREFIX"

# ── 1. Core framework ──────────────────────
echo ""
echo "=== adaptive-ui-framework ==="
cd "$BASE/adaptive-ui-framework"
npm install --legacy-peer-deps
npx tsc -b --noEmit
echo "✓ framework typecheck passed"

# Link core so packs and demos can resolve it
echo "  Linking @sabbour/adaptive-ui-core..."
cd "$BASE/adaptive-ui-framework/packs/core"
npm link
echo "✓ @sabbour/adaptive-ui-core linked"

# ── 2. Packs ───────────────────────────────
PACKS=(
  adaptive-ui-azure-pack
  adaptive-ui-github-pack
  adaptive-ui-google-flights-pack
  adaptive-ui-google-maps-pack
  adaptive-ui-travel-data-pack
)

for pack in "${PACKS[@]}"; do
  echo ""
  echo "=== $pack ==="
  cd "$BASE/packs/$pack"
  npm install --legacy-peer-deps
  npm link @sabbour/adaptive-ui-core
  npx tsc -b --noEmit
  npm link  # make this pack available for demos
  echo "✓ $pack typecheck passed & linked"
done

# ── 3. Demos ───────────────────────────────
echo ""
echo "=== adaptive-ui-trip-notebook ==="
cd "$BASE/demos/adaptive-ui-trip-notebook"
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm link @sabbour/adaptive-ui-core @sabbour/adaptive-ui-travel-data-pack @sabbour/adaptive-ui-google-maps-pack @sabbour/adaptive-ui-google-flights-pack
npx tsc -b
npx vite build
echo "✓ trip-notebook build passed"

echo ""
echo "=== adaptive-ui-solution-architect ==="
cd "$BASE/demos/adaptive-ui-solution-architect"
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm link @sabbour/adaptive-ui-core @sabbour/adaptive-ui-azure-pack @sabbour/adaptive-ui-github-pack
npx tsc -b
npx vite build
echo "✓ solution-architect build passed"

echo ""
echo "=== adaptive-ui-try-aks ==="
cd "$BASE/demos/adaptive-ui-try-aks"
npm install --legacy-peer-deps
npm link @sabbour/adaptive-ui-core @sabbour/adaptive-ui-azure-pack @sabbour/adaptive-ui-github-pack
npx tsc -b
npx vite build
echo "✓ try-aks build passed"

# ── Done ─────────────────────────────────────
echo ""
echo "========================================="
echo "  All builds passed!"
echo "========================================="
echo ""
echo "To run a demo:"
echo "  cd demos/adaptive-ui-trip-notebook && npm run dev"
echo "  cd demos/adaptive-ui-solution-architect && npm run dev"
echo "  cd demos/adaptive-ui-try-aks && npm run dev"
