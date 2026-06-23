@echo off
:: ============================================================
::  NT Commerce Bridge — Windows Build Script
::  Run this file inside the bridge\ directory.
::  Output: dist\NT_Commerce_Bridge.exe  (single-file)
:: ============================================================

setlocal
cd /d "%~dp0"

echo.
echo ============================================================
echo   NT Commerce Bridge — Building Windows Installer
echo ============================================================
echo.

:: ── 1. Check Python ──────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found.
    echo   Download from: https://www.python.org/downloads/
    echo   Make sure "Add Python to PATH" is checked during install.
    pause
    exit /b 1
)

:: ── 2. Install / upgrade build dependencies ──────────────────
echo [1/4] Installing dependencies...
pip install --quiet --upgrade pyinstaller pystray Pillow pyserial requests
if errorlevel 1 (
    echo [ERROR] pip install failed.
    pause
    exit /b 1
)

:: ── 3. Clean previous build ───────────────────────────────────
echo [2/4] Cleaning previous build...
if exist build  rmdir /s /q build
if exist dist   rmdir /s /q dist

:: ── 4. Run PyInstaller ────────────────────────────────────────
echo [3/4] Building .exe (this takes 1-2 minutes)...
pyinstaller bridge.spec
if errorlevel 1 (
    echo [ERROR] PyInstaller build failed.
    pause
    exit /b 1
)

:: ── 5. Done ───────────────────────────────────────────────────
echo [4/4] Done!
echo.
echo   Output: dist\NT_Commerce_Bridge.exe
echo.
echo   Copy NT_Commerce_Bridge.exe to the shop computer and double-click it.
echo   The setup wizard will open on first launch.
echo.
pause
