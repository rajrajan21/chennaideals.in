@echo off
cd /d "%~dp0"
if not exist package.json (
  echo Put these 2 files inside your project folder, then run again.
  pause
  exit /b 1
)
node gemini-doctor.mjs
echo.
pause
