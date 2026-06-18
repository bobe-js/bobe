#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PAGEFIND_DIR="$APP_DIR/dist/client/pagefind"

cd "$APP_DIR"

if [ ! -d "$PAGEFIND_DIR" ]; then
  echo "Pagefind index not found. Running build:ssg first..."
  pnpm run build:ssg
fi

exec node server.js
