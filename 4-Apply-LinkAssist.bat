@echo off
cd /d "%~dp0"
if not exist package.json (
  echo Put these files and the payload folder inside the project folder, then run again.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply-LinkAssist.ps1"
pause
