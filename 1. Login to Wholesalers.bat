@echo off
title Setup Wholesaler Login
echo ==================================================
echo         SETUP WHOLESALER SCRAPER LOGIN
echo ==================================================
echo.
cd /d "E:\Projects\kings-head-manager-v4\kings-head-manager-v4"
call npm run scrape:login
if errorlevel 1 (
    echo.
    echo ==================================================
    echo FAILED - see the error above for details.
    echo ==================================================
) else (
    echo.
    echo ==================================================
    echo Setup Complete! You can now run the update script.
    echo ==================================================
)
pause
