@echo off
setlocal DisableDelayedExpansion
title MadBox
cd /d "%~dp0"
if errorlevel 1 goto folder_error

echo MadBox - Windows browser launcher
echo.
if not exist "package.json" goto folder_error
if not exist "scripts\check-node.cjs" goto folder_error

where node >nul 2>&1
if errorlevel 1 goto node_missing
node "scripts\check-node.cjs"
if not "%errorlevel%"=="0" goto node_missing
where npm.cmd >nul 2>&1
if errorlevel 1 goto npm_missing

if exist "node_modules\.bin\vite.cmd" goto launch
echo.
echo MadBox needs its project packages before the first launch.
echo This downloads the locked packages into this MadBox folder only.
choice /C YN /N /M "Install these packages using npm ci? [Y/N] "
if errorlevel 2 goto setup_cancelled
if errorlevel 1 goto install_packages
goto setup_cancelled

:install_packages
call npm.cmd ci
if not "%errorlevel%"=="0" goto setup_failed

:launch
echo.
echo Opening MadBox in your browser. Keep this window open while playing.
echo Press Ctrl+C here to stop MadBox.
echo The fixed local port keeps the browser's saved-world address consistent.
echo.
call npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort --open
set "MADBOX_EXIT_CODE=%errorlevel%"
echo.
echo MadBox stopped with exit code %MADBOX_EXIT_CODE%.
if "%MADBOX_EXIT_CODE%"=="0" goto stopped
echo If you did not stop it yourself, check the error above.
echo For missing-package errors, run npm.cmd ci manually in this folder.
echo If port 5173 is busy, another MadBox window may already be running.
echo Stop that window before trying again. Do not clear browser data.
:stopped
pause
exit /b %MADBOX_EXIT_CODE%

:node_missing
echo.
echo Install Node.js 22.12 or newer manually from https://nodejs.org
echo Node.js 24 LTS is recommended. Close this window after installation,
echo then double-click StartMadBox.cmd again.
pause
exit /b 1

:npm_missing
echo.
echo npm.cmd could not be found. Reinstall Node.js with npm included,
echo then open a new launcher window. No software was installed by this launcher.
pause
exit /b 1

:folder_error
echo.
echo Extract the entire MadBox ZIP first. Keep StartMadBox.cmd beside
echo package.json and the scripts folder. Do not run it inside the ZIP viewer.
pause
exit /b 1

:setup_cancelled
echo.
echo Setup cancelled. No package installation was started.
echo You can run npm.cmd ci manually in this folder and launch MadBox later.
pause
exit /b 0

:setup_failed
echo.
echo Package setup failed. Read or copy the npm error above.
echo Check your internet connection, then try again. Do not delete saved worlds.
pause
exit /b 1
