@echo off
REM ===========================================================================
REM  Generate Article Images  —  double-click this file to run.
REM  Launches Chrome, opens ChatGPT (log in if asked), generates each article's
REM  hero image from its prompt, and saves it into the site.
REM
REM  Pass-through options (optional), e.g. from a terminal:
REM     Generate-Article-Images.cmd --all --force
REM     Generate-Article-Images.cmd --slug the-song-you-cant-sing-yet
REM ===========================================================================
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js is required but was not found on PATH.
  echo     Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist "node_modules\playwright" (
  echo [*] First run: installing dependencies ^(Playwright^)...
  call npm install
  if errorlevel 1 ( echo [!] npm install failed. & pause & exit /b 1 )
  echo [*] Installing the Chrome browser for automation...
  call npx playwright install chrome
)

echo.
echo [*] Starting. A Chrome window will open. Log in to ChatGPT if prompted.
echo.
node gen-article-images.mjs %*

echo.
echo [*] Done. Review the images under app\web\public\articles\images\
pause
endlocal
