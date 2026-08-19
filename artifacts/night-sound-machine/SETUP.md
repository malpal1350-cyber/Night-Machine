# Night Sound Machine — Setup Guide

A quiet sleep-sound player that runs entirely on your local machine.  
**No internet connection needed** — all sounds, fonts, and code are included in the zip.

---

## What you need

| Platform | Requirement |
|---|---|
| **Linux / Raspberry Pi** | Python 3 (pre-installed on Ubuntu / Raspberry Pi OS) — or Node.js |
| **macOS** | Python 3 (pre-installed on macOS 12+) — or Node.js |
| **Windows** | Node.js — download free from [nodejs.org](https://nodejs.org) |

No other software or internet access is required after download.

---

## Quick start

### Step 1 — Download the zip

Download **night-sound-machine.zip** from the [latest GitHub Release](../../releases/latest) and save it anywhere you like (Desktop, Downloads, etc.).

### Step 2 — Unzip

- **Windows**: Right-click the zip → *Extract All…*
- **macOS / Linux**: Double-click the zip, or run `unzip night-sound-machine.zip`

### Step 3 — Start the app

**Linux / macOS / Raspberry Pi**

Open a terminal in the unzipped folder and run:

```bash
bash start.sh
```

Or make it executable first:

```bash
chmod +x start.sh
./start.sh
```

**Windows**

Double-click **start.bat**.  
If Windows Defender asks, click *More info → Run anyway* — the script only starts a local web server on your machine.

### Step 4 — Open your browser

The script will try to open your browser automatically.  
If it doesn't, open your browser and go to:

```
http://localhost:8080
```

### Step 5 — Install as an app (optional)

When the page loads your browser may show an **Install** banner.  
Click it to add Night Sound Machine to your home screen or desktop — it will open in its own window, just like a native app, and work fully offline.

---

## How it works

The zip contains:

| File / Folder | What it is |
|---|---|
| `dist/public/` | Pre-built app — everything the browser needs |
| `start.sh` | Launcher for Linux / macOS / Raspberry Pi |
| `start.bat` | Launcher for Windows |
| `server.js` | Tiny local web server (uses Node.js built-ins, no npm needed) |
| `SETUP.md` | This file |

`start.sh` prefers Python 3's built-in `http.server` (zero extra installs). If Python 3 is absent, it falls back to `server.js` via Node.js. `start.bat` uses `server.js` directly.

---

## Changing the port

Set the `PORT` environment variable if 8080 is already in use:

```bash
PORT=9090 bash start.sh          # Linux / macOS
```

Or pass the port as an argument to the server directly:

```bash
node server.js 9090
```

On Windows, edit `start.bat` and change `set PORT=8080` to your preferred port.

---

## Stopping the app

Press **Ctrl + C** in the terminal window, or close the terminal.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "dist/public not found" | Re-download the zip — the pre-built files may be missing. |
| Port 8080 already in use | Change the port as described above. |
| Windows Defender blocked start.bat | Click *More info → Run anyway*. |
| Browser shows a blank page | Make sure you opened `http://localhost:8080` (not `https://`). |
| Sounds don't play | Click anywhere on the page first — browsers require a user gesture to allow audio. |
| Clock font looks different | Custom clock fonts need an internet connection; the app uses your system font offline. |

---

## Rebuilding from source

To build the app yourself after making changes (requires Node.js + pnpm):

```bash
bash build-dist-zip.sh
```

Run from the project root. It produces a fresh `night-sound-machine.zip`.
