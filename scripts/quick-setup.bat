@echo off
REM ChennaiDeals.in - Quick Start Setup Script for Windows
REM This script automates the initial setup process

setlocal enabledelayedexpansion

echo.
echo ================================
echo ChennaiDeals.in - Quick Setup
echo ================================
echo.

REM Step 1: Check prerequisites
echo Step 1: Checking Prerequisites...
echo.

REM Check Node.js
for /f "tokens=*" %%i in ('node --version 2^>nul') do set NODE_VERSION=%%i
if defined NODE_VERSION (
    echo [OK] Node.js installed: %NODE_VERSION%
) else (
    echo [ERROR] Node.js not found. Please install Node.js ^>= 22.22.0
    exit /b 1
)

REM Check npm
for /f "tokens=*" %%i in ('npm --version 2^>nul') do set NPM_VERSION=%%i
if defined NPM_VERSION (
    echo [OK] npm installed: %NPM_VERSION%
) else (
    echo [ERROR] npm not found. Please install npm ^>= 10.0.0
    exit /b 1
)

REM Check if node_modules exists
if exist "node_modules" (
    echo [WARNING] node_modules already exists. Skipping npm install.
    echo [INFO] Run 'npm install' manually if you want to reinstall.
) else (
    echo Step 2: Installing Dependencies...
    echo.
    echo [INFO] Running: npm install
    call npm install
    if !errorlevel! equ 0 (
        echo [OK] Dependencies installed successfully
    ) else (
        echo [ERROR] Failed to install dependencies
        exit /b 1
    )
)

REM Step 3: Environment setup
echo.
echo Step 3: Environment Setup...
echo.

if exist ".env.local" (
    echo [WARNING] .env.local already exists
    echo [INFO] Review your environment variables:
    echo.
    type .env.local | findstr /R "^[A-Z_]" | more
) else (
    echo [INFO] Creating .env.local from env.example...
    if exist "env.example" (
        copy env.example .env.local
        echo [OK] .env.local created from env.example
        echo [WARNING] IMPORTANT: Edit .env.local with your database credentials:
        echo   - DATABASE_URL
        echo   - AUTH_SECRET
        echo   - VITE_APP_URL
    ) else (
        echo [ERROR] env.example not found
    )
)

REM Step 4: Database setup
echo.
echo Step 4: Database Setup...
echo.

set /p DB_SETUP="Do you want to run database migrations now? (y/n): "
if /i "%DB_SETUP%"=="y" (
    echo [INFO] Running: npx drizzle-kit push
    call npx drizzle-kit push
    if !errorlevel! equ 0 (
        echo [OK] Database migrations completed
    ) else (
        echo [WARNING] Database migration may have failed. Check your DATABASE_URL in .env.local
    )
) else (
    echo [WARNING] Skipping migrations. Run 'npx drizzle-kit push' manually when ready.
)

REM Step 5: Verify setup
echo.
echo Step 5: Verification...
echo.

echo [INFO] Running TypeScript check...
call npm run type-check 2^>&1 | more

echo.
echo [OK] Setup complete!

REM Summary
echo.
echo ================================
echo Setup Summary
echo ================================
echo.
echo Next steps:
echo.
echo 1. Edit .env.local with your configuration:
echo    Open .env.local in your text editor
echo.
echo 2. Ensure database is running and migrations applied
echo.
echo 3. Start the development server:
echo    npm run dev
echo.
echo 4. Open browser to:
echo    http://localhost:5173
echo.
echo 5. Run tests anytime:
echo    npm test
echo.
echo ================================
echo.

pause
