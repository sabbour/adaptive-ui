#!/bin/bash
set -e

BASE="/mnt/c/Users/asabbour/Git/adaptive-ui"
export GIT_AUTHOR_NAME="Ahmed Sabbour"
export GIT_AUTHOR_EMAIL="sabbour@outlook.com"
export GIT_COMMITTER_NAME="Ahmed Sabbour"
export GIT_COMMITTER_EMAIL="sabbour@outlook.com"

MSG="fix: replace npm ci with npm install, add react/react-dom devDeps, generate lock file

- Workflows: npm ci -> npm install (peer dep on GPR cannot be locked without auth)
- package.json: add react, react-dom to devDependencies
- package-lock.json: initial lock file via npm install --legacy-peer-deps
- .gitignore: exclude node_modules/ and dist/"

echo "=== adaptive-ui-framework ==="
cd "$BASE/adaptive-ui-framework"
git add .github/workflows/ci.yml .github/workflows/publish.yml packs/core/package.json package-lock.json
git commit -m "$MSG" && echo "OK" || echo "ALREADY COMMITTED OR NOTHING TO COMMIT"

for pack in adaptive-ui-travel-data-pack adaptive-ui-github-pack adaptive-ui-google-flights-pack adaptive-ui-google-maps-pack adaptive-ui-azure-pack; do
  echo "=== $pack ==="
  cd "$BASE/packs/$pack"
  git add .github/workflows/ci.yml .github/workflows/publish.yml package.json package-lock.json .gitignore
  git commit -m "$MSG" && echo "OK" || echo "ALREADY COMMITTED OR NOTHING TO COMMIT"
done

for demo in adaptive-ui-trip-notebook adaptive-ui-solution-architect; do
  echo "=== $demo ==="
  cd "$BASE/demos/$demo"
  git add .github/workflows/ci.yml .gitignore
  git commit -m "$MSG" && echo "OK" || echo "ALREADY COMMITTED OR NOTHING TO COMMIT"
done

echo "=== ALL DONE ==="
