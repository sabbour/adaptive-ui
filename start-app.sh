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

echo "Starting $1 ($TARGET)..."
cd "$BASE/$TARGET"
npm run dev
