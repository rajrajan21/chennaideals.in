@echo off
setlocal enableextensions
rem Run this from inside your ChennaiDeals project folder (double-click after copying it there).
cd /d "%~dp0"
if not exist ".git" (
  echo This folder is not a git repository. Copy this file into C:\Users\itsme\Documents\chennaideals.in-git and run again.
  pause & exit /b 1
)

echo.
echo === Safety check: secrets must be ignored ===
git check-ignore -q .env.local
if errorlevel 1 (
  echo .env.local is NOT in .gitignore. Adding it now.
  echo.>>.gitignore
  echo .env>>.gitignore
  echo .env.local>>.gitignore
  echo .env.*.local>>.gitignore
)
git check-ignore -q node_modules || (echo node_modules>>.gitignore)
git check-ignore -q dist || (echo dist>>.gitignore)
echo _backup*>>.gitignore
echo src_backup*>>.gitignore

git add -A
git diff --cached --name-only | findstr /i /r "\.env \.pem \.key id_rsa" >nul
if not errorlevel 1 (
  echo.
  echo STOP: a secrets-looking file is staged:
  git diff --cached --name-only | findstr /i /r "\.env \.pem \.key id_rsa"
  git reset >nul
  echo Nothing was committed. Remove or ignore that file, then run again.
  pause & exit /b 1
)

echo.
echo === Changes to be committed ===
git status --short
echo.
set /p OK=Commit and push these changes? (y/n): 
if /i not "%OK%"=="y" (git reset >nul & echo Cancelled. & pause & exit /b 0)

> "%TEMP%\cd-commit-msg.txt" echo Deal Hunter, editor notes, safety notice and contact updates (Packs 4-11)
>> "%TEMP%\cd-commit-msg.txt" echo.
>> "%TEMP%\cd-commit-msg.txt" echo - Admin-only Deal Hunter: eCommerce, Chennai local by area, Facebook/Instagram; multi-AI engine selection
>> "%TEMP%\cd-commit-msg.txt" echo - "Ways to save more" editor note on every deal, Deal of the Day API, New-tab fallback
>> "%TEMP%\cd-commit-msg.txt" echo - Safety notice, WhatsApp/Report buttons, contact email switch tool
>> "%TEMP%\cd-commit-msg.txt" echo.
>> "%TEMP%\cd-commit-msg.txt" echo Co-Authored-By: Claude Sonnet 5.5 ^<noreply@anthropic.com^>
>> "%TEMP%\cd-commit-msg.txt" echo Claude-Session: https://claude.ai/code/session_01GYaat52UuafjU1LffLi4sz

git commit -F "%TEMP%\cd-commit-msg.txt"
if errorlevel 1 (echo Commit failed or nothing to commit. & pause & exit /b 1)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
echo.
echo === Pushing branch %BRANCH% ===
git push -u origin %BRANCH%
if errorlevel 1 (
  echo.
  echo Push failed. If no remote is set, run:  git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
  echo If asked to sign in, use your GitHub login or a personal access token.
  pause & exit /b 1
)
echo.
echo Done. Changes are on GitHub.
pause
