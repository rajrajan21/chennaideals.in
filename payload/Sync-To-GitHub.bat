@echo off
cd /d "%~dp0"
if not exist .git (
  echo Put these files inside the project folder, then run again.
  pause
  exit /b 1
)
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Sync-To-GitHub.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Sync-To-GitHub.ps1" -Message "%~1"
)
pause
