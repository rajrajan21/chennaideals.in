@echo off
REM ChennaiDeals.in - Complete Testing Script for Windows
REM Run all tests before deployment

setlocal enabledelayedexpansion

echo.
echo ================================
echo ChennaiDeals.in - Test Suite
echo ================================
echo.

set FAILED_TESTS=0

REM Phase 1: Environment Check
echo ================================
echo Phase 1: Environment Check
echo ================================
echo.

npm list --depth=0 >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] Dependencies installed
) else (
    echo [ERROR] Dependencies not installed. Run 'npm install'
    set /a FAILED_TESTS+=1
)

if exist ".env.local" (
    echo [OK] Environment file exists
) else (
    echo [ERROR] Environment file missing. Run 'copy env.example .env.local'
    set /a FAILED_TESTS+=1
)

REM Phase 2: Type Checking
echo.
echo ================================
echo Phase 2: TypeScript Type Checking
echo ================================
echo.

npm run type-check 2>&1 | findstr /C:"error TS" >nul
if !errorlevel! equ 0 (
    echo [ERROR] TypeScript errors found
    call npm run type-check
    set /a FAILED_TESTS+=1
) else (
    echo [OK] All TypeScript checks passed
)

REM Phase 3: Linting
echo.
echo ================================
echo Phase 3: ESLint Validation
echo ================================
echo.

npm run lint 2>&1 | findstr /C:"error" >nul
if !errorlevel! equ 0 (
    echo [ERROR] Lint errors found
    call npm run lint
    set /a FAILED_TESTS+=1
) else (
    echo [OK] All lint checks passed
)

REM Phase 4: Unit Tests
echo.
echo ================================
echo Phase 4: Unit Tests
echo ================================
echo.

npm test -- --run 2>&1 | findstr /C:"FAIL" >nul
if !errorlevel! equ 0 (
    echo [ERROR] Some tests failed
    call npm test -- --run
    set /a FAILED_TESTS+=1
) else (
    echo [OK] All unit tests passed
    call npm test -- --run 2>&1 | more
)

REM Phase 5: Build Test
echo.
echo ================================
echo Phase 5: Production Build
echo ================================
echo.

npm run build 2>&1 | findstr /C:"error" >nul
if !errorlevel! equ 0 (
    echo [ERROR] Build failed
    set /a FAILED_TESTS+=1
) else (
    echo [OK] Production build succeeded
    echo.
    echo Build artifacts:
    dir /S dist\index.html
    dir dist\assets
)

REM Phase 6: Security Audit
echo.
echo ================================
echo Phase 6: Security Audit
echo ================================
echo.

npm run audit 2>&1 | findstr /C:"vulnerabilities" >nul
if !errorlevel! equ 0 (
    echo [ERROR] Security vulnerabilities found
    set /a FAILED_TESTS+=1
) else (
    echo [OK] No security vulnerabilities found
)

REM Summary
echo.
echo ================================
echo Test Summary
echo ================================
echo.

if !FAILED_TESTS! equ 0 (
    echo ════════════════════════════════
    echo [OK] ALL TESTS PASSED - READY TO DEPLOY
    echo ════════════════════════════════
    echo.
    exit /b 0
) else (
    echo ════════════════════════════════
    echo [ERROR] !FAILED_TESTS! TEST^(S^) FAILED
    echo ════════════════════════════════
    echo.
    exit /b 1
)
