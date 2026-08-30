@echo off
REM NT Commerce Sync Agent - register auto-start (Run as Administrator)
set DIR=%~dp0
schtasks /create /tn "NTCommerceSyncAgent" /tr "\"%DIR%nt_sync_agent.exe\"" /sc onlogon /rl highest /f
if errorlevel 1 (
    echo [ERROR] failed - right-click this file and "Run as administrator"
) else (
    echo OK - the agent will start automatically at logon.
    echo Start it now with: schtasks /run /tn "NTCommerceSyncAgent"
)
pause
