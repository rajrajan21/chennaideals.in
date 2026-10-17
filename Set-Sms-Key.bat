@echo off
cd /d "%~dp0"
if not exist package.json (
  echo Run this from the project folder.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Set-Sms-Key.ps1"
pause
