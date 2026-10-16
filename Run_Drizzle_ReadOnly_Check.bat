@echo off
setlocal
cd /d "C:\Users\itsme\Documents\chennaideals.in-git"
if errorlevel 1 (
    echo ERROR: Cannot open project folder.
    pause
    exit /b 1
)

set "REPORT=%CD%\drizzle-check-report.txt"

(
    echo ============================================================
    echo CHENNAIDEALS.IN - DRIZZLE READ-ONLY CHECK
    echo Date: %DATE%  Time: %TIME%
    echo ============================================================
    echo.
    echo === A. ORIGINAL MIGRATION 0001 ===
    if exist "drizzle\0001_deal_alert_preferences.sql" (
        type "drizzle\0001_deal_alert_preferences.sql"
    ) else (
        echo FILE NOT FOUND
    )
    echo.
    echo === B. CURRENT SCHEMA MATCHES ===
    findstr /n /i /c:"dealAlertPreferences" /c:"dealMedia" /c:"editorNote" /c:"verification" "src\server\db\schema.ts"
    echo.
    echo === C. JOURNAL CHANGES ===
    git diff -- "drizzle\meta\_journal.json"
    echo.
    echo === D. WORKING TREE STATUS ===
    git status --short
    echo.
    echo === E. TRACKED DRIZZLE FILES ===
    git ls-files "drizzle"
    echo.
    echo === F. MIGRATION FILE HISTORY ===
    git log -5 --oneline -- "drizzle/0001_deal_alert_preferences.sql"
    git log -5 --oneline -- "drizzle/0002_verification_value_text.sql"
    echo.
    echo === END OF REPORT ===
) > "%REPORT%" 2>&1

echo.
echo Read-only checks completed.
echo Report: "%REPORT%"
start "" notepad "%REPORT%"
pause
endlocal
