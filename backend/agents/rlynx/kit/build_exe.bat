@echo off
REM NT Commerce Sync Agent - one-click exe builder (run on any Windows PC with Python)
echo === NT Commerce Sync Agent - Build ===
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.10+ from python.org
    echo         and CHECK "Add python.exe to PATH" during setup.
    pause
    exit /b 1
)
python -m pip install --upgrade pip
python -m pip install pyinstaller pyodbc
if errorlevel 1 (
    echo [ERROR] pip install failed - check your internet connection
    pause
    exit /b 1
)
python -m PyInstaller --onefile --clean --name nt_sync_agent nt_sync_agent.py
if errorlevel 1 (
    echo [ERROR] build failed
    pause
    exit /b 1
)
echo.
echo === DONE: dist\nt_sync_agent.exe ===
echo Next: copy dist\nt_sync_agent.exe + nt_sync_agent.json into C:\nt_sync
echo then run install_task.bat once (as Administrator) for auto-start.
pause
