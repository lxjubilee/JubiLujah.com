@echo off
setlocal enabledelayedexpansion
title Image Studio - Installer
cd /d "%~dp0"

REM Paths are relative to this /setup/image-studio/ folder.
set "PROJ=..\..\tools\ArticleImageStudio\ArticleImageStudio.csproj"
set "EXEREL=..\..\tools\ArticleImageStudio\bin\Release\net8.0-windows\ImageStudio.exe"

echo ============================================================
echo    Image Studio - Setup
echo ============================================================
echo.

REM ---- 1. Locate or install the .NET 8 SDK --------------------
set "DOTNET="
where dotnet >nul 2>nul && set "DOTNET=dotnet"
if not defined DOTNET if exist "%ProgramFiles%\dotnet\dotnet.exe" set "DOTNET=%ProgramFiles%\dotnet\dotnet.exe"
if not defined DOTNET (
  echo [*] .NET SDK not found. Installing the .NET 8 SDK via winget...
  winget install --id Microsoft.DotNet.SDK.8 -e --silent --accept-source-agreements --accept-package-agreements
  if exist "%ProgramFiles%\dotnet\dotnet.exe" set "DOTNET=%ProgramFiles%\dotnet\dotnet.exe"
)
if not defined DOTNET (
  echo [!] Could not find or install the .NET SDK. Install it from https://dotnet.microsoft.com and re-run.
  pause & exit /b 1
)
echo [*] Using dotnet: !DOTNET!

REM ---- 2. Build (Release) -------------------------------------
echo [*] Building Image Studio...
"!DOTNET!" build "%PROJ%" -c Release
if errorlevel 1 ( echo [!] Build failed. & pause & exit /b 1 )

REM ---- 3. Desktop shortcut -----------------------------------
echo [*] Creating a desktop shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$exe=(Resolve-Path '%EXEREL%').Path; $w=New-Object -ComObject WScript.Shell; $lnk=$w.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Image Studio.lnk'); $lnk.TargetPath=$exe; $lnk.WorkingDirectory=(Split-Path $exe); $lnk.Save()"

echo.
echo [*] Installed. Launching Image Studio...
start "" "%EXEREL%"
echo.
echo     A desktop shortcut named "Image Studio" was created.
echo     WebView2 Runtime is required (ships with Edge on Windows 10/11).
echo.
pause
endlocal
