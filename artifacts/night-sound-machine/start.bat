@echo off
REM Night Sound Machine — local static server launcher for Windows
REM Requires: Node.js (https://nodejs.org) — uses the bundled server.cjs, no npm downloads needed.

setlocal

set SCRIPT_DIR=%~dp0
set DIST_DIR=%SCRIPT_DIR%dist\public
set PORT=8080

if not exist "%DIST_DIR%" (
    echo Error: "%DIST_DIR%" not found.
    echo The pre-built app files are missing. Please re-download the zip.
    pause
    exit /b 1
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed.
    echo Please install Node.js from https://nodejs.org and try again.
    pause
    exit /b 1
)

if not exist "%SCRIPT_DIR%server.cjs" (
    echo Error: server.cjs not found in "%SCRIPT_DIR%".
    echo Please re-download the zip.
    pause
    exit /b 1
)

echo Starting Night Sound Machine on http://localhost:%PORT%
echo Press Ctrl+C to stop.
echo.

REM Open the browser after a short delay
start "" "http://localhost:%PORT%"

node "%SCRIPT_DIR%server.cjs" %PORT%

pause
