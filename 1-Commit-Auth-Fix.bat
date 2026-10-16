@echo off
cd /d "%~dp0"
if not exist .git (
  echo Put these files inside the project folder, then run again.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Commit-Auth-Fix.ps1"
pause
