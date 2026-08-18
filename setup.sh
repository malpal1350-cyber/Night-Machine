#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  Night Sound Machine — One-time setup for Ubuntu / Raspberry Pi
#
#  Run this once from the project folder:
#    bash setup.sh
#
#  After it finishes:
#  1. Open Chromium → http://localhost:3131
#  2. Click the install icon (⊕) in the address bar
#  3. A desktop icon appears — double-click it from now on
# ─────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/artifacts/night-sound-machine"
SERVE_DIR="$APP_DIR/dist/public"
PORT=3131

print_banner() {
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║     Night Sound Machine — Setup          ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
}

print_done() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  All done! Here is what to do next:                     ║"
  echo "║                                                          ║"
  echo "║  1. Open Chromium                                        ║"
  echo "║  2. Go to:  http://localhost:$PORT                         ║"
  echo "║  3. Click the install icon (⊕) in the address bar       ║"
  echo "║  4. The app will appear on your desktop                  ║"
  echo "║                                                          ║"
  echo "║  The server starts automatically every time you boot.    ║"
  echo "║  You never need to open a terminal again.                ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""
}

# ── 1. Node.js ────────────────────────────────────────────────
print_banner
echo "Step 1/6 — Checking Node.js..."

if ! command -v node &>/dev/null; then
  echo "  Node.js not found. Installing via nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  # Source nvm immediately so we can use it in this session
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
  echo "  Node.js $(node -v) installed."
else
  echo "  Node.js $(node -v) found."
fi

# ── 2. pnpm ───────────────────────────────────────────────────
echo ""
echo "Step 2/6 — Checking pnpm..."

if ! command -v pnpm &>/dev/null; then
  echo "  pnpm not found. Installing..."
  npm install -g pnpm
  echo "  pnpm installed."
else
  echo "  pnpm found."
fi

# ── 3. serve (static file server) ────────────────────────────
echo ""
echo "Step 3/6 — Checking serve..."

if ! command -v serve &>/dev/null; then
  echo "  Installing serve..."
  npm install -g serve
else
  echo "  serve found."
fi

# ── 4. Generate PNG icons ─────────────────────────────────────
echo ""
echo "Step 4/6 — Generating app icons..."

SVG_SRC="$APP_DIR/public/icon.svg"
PNG_192="$APP_DIR/public/icon-192.png"
PNG_512="$APP_DIR/public/icon-512.png"

if [ -f "$PNG_192" ] && [ -f "$PNG_512" ]; then
  echo "  Icons already exist — skipping."
elif command -v rsvg-convert &>/dev/null; then
  rsvg-convert -w 192 -h 192 "$SVG_SRC" -o "$PNG_192"
  rsvg-convert -w 512 -h 512 "$SVG_SRC" -o "$PNG_512"
  echo "  Icons generated."
else
  echo "  rsvg-convert not found. Trying to install librsvg2-bin..."
  sudo apt-get install -y librsvg2-bin 2>/dev/null && {
    rsvg-convert -w 192 -h 192 "$SVG_SRC" -o "$PNG_192"
    rsvg-convert -w 512 -h 512 "$SVG_SRC" -o "$PNG_512"
    echo "  Icons generated."
  } || {
    # Fallback: ImageMagick
    if command -v convert &>/dev/null; then
      convert -background '#1b1823' -resize 192x192 "$SVG_SRC" "$PNG_192" 2>/dev/null || true
      convert -background '#1b1823' -resize 512x512 "$SVG_SRC" "$PNG_512" 2>/dev/null || true
      echo "  Icons generated via ImageMagick."
    else
      echo "  Warning: Could not generate PNG icons."
      echo "  The app will still work; the desktop icon may show as blank."
      echo "  To fix later: sudo apt-get install librsvg2-bin && bash setup.sh"
    fi
  }
fi

# ── 5. Build the app ──────────────────────────────────────────
echo ""
echo "Step 5/6 — Building the app (this takes about a minute)..."

cd "$SCRIPT_DIR"
pnpm install
pnpm --filter @workspace/night-sound-machine run build

echo "  Build complete."

# ── 6. Systemd service (auto-start on boot) ───────────────────
echo ""
echo "Step 6/6 — Setting up auto-start service..."

SERVE_BIN="$(command -v serve)"
SERVICE_FILE=/etc/systemd/system/night-sound-machine.service

sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Night Sound Machine
After=graphical-session.target network.target
Wants=graphical-session.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=$SERVE_BIN "$SERVE_DIR" -l $PORT --no-clipboard
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=graphical-session.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable night-sound-machine
sudo systemctl restart night-sound-machine

# Give it a moment to start
sleep 2

if systemctl is-active --quiet night-sound-machine; then
  echo "  Service is running on port $PORT."
else
  echo "  Warning: Service did not start. Check logs with:"
  echo "    journalctl -u night-sound-machine -n 30"
fi

print_done
