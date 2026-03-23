#!/bin/bash
set -e

BASE="$(cd "$(dirname "$0")" && pwd)"

APPS=(
  "trip-notebook:demos/adaptive-ui-trip-notebook"
  "solution-architect:demos/adaptive-ui-solution-architect"
  "try-aks:demos/adaptive-ui-try-aks"
)

usage() {
  echo "Usage: bash start-app.sh <app-name>"
  echo ""
  echo "Available apps:"
  for entry in "${APPS[@]}"; do
    name="${entry%%:*}"
    path="${entry##*:}"
    echo "  $name    ($path)"
  done
  exit 1
}

if [[ -z "$1" ]]; then
  usage
fi

TARGET=""
for entry in "${APPS[@]}"; do
  name="${entry%%:*}"
  path="${entry##*:}"
  if [[ "$1" == "$name" ]]; then
    TARGET="$path"
    break
  fi
done

if [[ -z "$TARGET" ]]; then
  echo "Unknown app: $1"
  echo ""
  usage
fi

# ── Start API backend (Azure Functions) ──
echo "Starting API backend (Azure Functions)..."
cd "$BASE/api"
npm run build 2>/dev/null || true
npx func start --port 7071 &
API_PID=$!
echo "API backend started (PID $API_PID) on http://localhost:7071"

# Ensure API process is stopped when the script exits
trap "echo 'Stopping API backend...'; kill $API_PID 2>/dev/null" EXIT INT TERM

# Wait briefly for Functions runtime to initialize
sleep 2

# ── Start the demo app ──
echo "Starting $1 ($TARGET)..."
cd "$BASE/$TARGET"
npm run dev
