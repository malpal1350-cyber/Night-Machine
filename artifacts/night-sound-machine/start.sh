#!/usr/bin/env bash
# Night Sound Machine — local static server launcher
# Works on Linux, macOS, and Raspberry Pi.
#
# Preferred: Python 3 (pre-installed on Ubuntu, Raspberry Pi OS, macOS 12+)
# Fallback:  Node.js — uses the bundled server.js (no npm downloads needed)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist/public"
PORT="${PORT:-8080}"

if [ ! -d "$DIST_DIR" ]; then
  echo "Error: '$DIST_DIR' not found."
  echo "The pre-built app files are missing. Please re-download the zip."
  exit 1
fi

echo "Starting Night Sound Machine on http://localhost:$PORT"
echo "Press Ctrl+C to stop."
echo ""

# Try to open the browser automatically (best-effort, not fatal if it fails)
open_browser() {
  local url="http://localhost:$PORT"
  if command -v xdg-open &>/dev/null; then
    (sleep 1 && xdg-open "$url") &
  elif command -v open &>/dev/null; then
    (sleep 1 && open "$url") &
  fi
}

# Option 1: Python 3's built-in http.server — zero extra installs on Ubuntu/Pi/macOS
if command -v python3 &>/dev/null; then
  open_browser
  cd "$DIST_DIR"
  exec python3 -m http.server "$PORT"
fi

# Option 2: Node.js with the bundled server.js — no npm/npx downloads needed
if command -v node &>/dev/null && [ -f "$SCRIPT_DIR/server.cjs" ]; then
  echo "(Python 3 not found — using Node.js server.cjs instead)"
  open_browser
  exec node "$SCRIPT_DIR/server.cjs" "$PORT"
fi

echo "Error: Neither Python 3 nor Node.js is installed."
echo "Please install Python 3 (https://python.org) and try again."
exit 1
