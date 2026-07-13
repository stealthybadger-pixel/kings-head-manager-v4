@echo off
title Update Wholesaler Prices
echo ==================================================
echo         RUNNING WHOLESALER PRICE SYNC
echo ==================================================
echo.
cd /d "E:\Projects\kings-head-manager-v4\kings-head-manager-v4"
call npm run scrape:update
if errorlevel 1 (
    echo.
    echo ==================================================
    echo FAILED - see the error above for details.
    echo If it mentions missing auth files, run
    echo "1. Login to Wholesalers.bat" first.
    echo ==================================================
) else (
    echo.
    echo ==================================================
    echo Sync Complete! Updated Firestore database prices.
    echo ==================================================
)
pause
