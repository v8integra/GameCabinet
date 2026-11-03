@echo off
rem Double-click to play locally: starts the Game Cabinet server and opens it in your browser.
rem Close this window to stop the server.
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js is needed to run the cabinet locally: https://nodejs.org
  pause
  exit /b 1
)
start "" cmd /c "ping -n 2 127.0.0.1 >nul & start http://localhost:8090"
node serve.js
