@echo off
cd /d "%~dp0"
if not exist package.json cd /d C:\Users\itsme\Documents\chennaideals.in
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0collect-local-state.ps1"
pause
