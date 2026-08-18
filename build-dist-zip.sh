#!/usr/bin/env bash
# build-dist-zip.sh
# Builds Night Sound Machine and packages it into a distributable zip.
# The resulting zip runs fully offline — no internet connection required.
# Run from the monorepo root.
#
# Requirements: Node.js, pnpm, Python 3 (for source patching)
# Output: night-sound-machine.zip (in the repo root)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$REPO_ROOT/artifacts/night-sound-machine"
DIST_DIR="$APP_DIR/dist/public"
SRC_CSS="$APP_DIR/src/index.css"
SRC_HTML="$APP_DIR/index.html"
SRC_APP="$APP_DIR/src/App.tsx"
ZIP_NAME="night-sound-machine.zip"
ZIP_PATH="$REPO_ROOT/$ZIP_NAME"

# --- Restore function: always run on exit so source files are never left patched ---
restore_sources() {
  [ -f "${SRC_CSS}.orig"  ] && mv "${SRC_CSS}.orig"  "$SRC_CSS"
  [ -f "${SRC_HTML}.orig" ] && mv "${SRC_HTML}.orig" "$SRC_HTML"
  [ -f "${SRC_APP}.orig"  ] && mv "${SRC_APP}.orig"  "$SRC_APP"
}
trap restore_sources EXIT

echo "=== Night Sound Machine — distributable zip builder ==="
echo ""

# --- 1. Patch sources to remove Google Fonts before building ---
echo "Step 1/5: Removing Google Fonts references from source for offline build..."

cp "$SRC_CSS"  "${SRC_CSS}.orig"
cp "$SRC_HTML" "${SRC_HTML}.orig"
cp "$SRC_APP"  "${SRC_APP}.orig"

# Strip the Google Fonts @import line from index.css (own line, safe to filter)
grep -v 'fonts\.googleapis\.com' "$SRC_CSS" > "${SRC_CSS}.tmp" && mv "${SRC_CSS}.tmp" "$SRC_CSS"

# Strip the three Google Fonts lines from index.html (each on its own line)
grep -v 'fonts\.googleapis\.com' "$SRC_HTML" | grep -v 'fonts\.gstatic\.com' > "${SRC_HTML}.tmp" && mv "${SRC_HTML}.tmp" "$SRC_HTML"

# Neutralise the runtime clock-font loader in App.tsx:
# Replace the Google Fonts href assignment with an empty string so the
# useEffect still runs but injects no external requests.
python3 - "$SRC_APP" <<'PYEOF'
import sys, re
path = sys.argv[1]
with open(path) as f:
    src = f.read()
# Remove the googleapis href assignment inside the clock-font preload effect
patched = re.sub(
    r"link\.href\s*=\s*`https://fonts\.googleapis\.com[^`]*`",
    'link.href = "" /* offline build: no external fonts */',
    src
)
with open(path, "w") as f:
    f.write(patched)
print(f"  Patched: src/App.tsx  (clock font Google Fonts href neutralised, {src.count('googleapis')} → {patched.count('googleapis')} googleapis refs)")
PYEOF

echo "  Patched: src/index.css  (Google Fonts @import removed)"
echo "  Patched: index.html     (Google Fonts preconnect/link removed)"
echo ""

# --- 2. Build ---
echo "Step 2/5: Building the app..."
cd "$REPO_ROOT"
# PORT is required by vite.config.ts when REPL_ID is set (Replit environment).
PORT="${PORT:-3131}" pnpm --filter @workspace/night-sound-machine run build
echo "Build complete. Output: $DIST_DIR"
echo ""

# --- 3. Restore sources immediately after build ---
restore_sources
trap - EXIT
echo "Step 3/5: Source files restored."
echo ""

# --- 4. Sanity checks ---
echo "Step 4/5: Verifying build output..."

if [ ! -f "$DIST_DIR/index.html" ]; then
  echo "Error: $DIST_DIR/index.html not found."
  exit 1
fi

CSS_FILE="$(find "$DIST_DIR/assets" -name '*.css' | head -1)"
CSS_BYTES="$(wc -c < "$CSS_FILE")"
if [ "${CSS_BYTES:-0}" -lt 1000 ]; then
  echo "Error: bundled CSS appears empty or too small (${CSS_BYTES} bytes)."
  exit 1
fi

JS_FILE="$(find "$DIST_DIR/assets" -name '*.js' | head -1)"
if grep -q 'fonts\.googleapis\.com' "$DIST_DIR/index.html" 2>/dev/null; then
  echo "Error: Google Fonts reference still in dist/index.html."
  exit 1
fi
if grep -q 'fonts\.googleapis\.com' "$CSS_FILE" 2>/dev/null; then
  echo "Error: Google Fonts reference still in bundled CSS."
  exit 1
fi
if grep -q 'fonts\.googleapis\.com' "$JS_FILE" 2>/dev/null; then
  echo "Error: Google Fonts reference still in bundled JS."
  exit 1
fi

echo "  OK: index.html (no external font refs)"
echo "  OK: CSS bundle ($(basename "$CSS_FILE"), ${CSS_BYTES} bytes, no external font refs)"
echo "  OK: JS bundle  ($(basename "$JS_FILE"), no external font refs)"
echo ""

# --- 5. Package ---
echo "Step 5/5: Creating zip..."
rm -f "$ZIP_PATH"

cd "$APP_DIR"
zip -r "$ZIP_PATH" \
  dist/public \
  start.sh \
  start.bat \
  server.cjs \
  SETUP.md \
  --exclude "*.DS_Store"

echo ""
echo "Done!"
echo ""
echo "  Output : $ZIP_PATH"
echo "  Size   : $(du -sh "$ZIP_PATH" | cut -f1)"
echo ""
echo "Distribute $ZIP_NAME. Recipients follow SETUP.md to run the app."
