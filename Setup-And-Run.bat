@echo off
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo ======================================================
echo    Prompt Cowboy Desktop Overlay (Startup Setup)
echo ======================================================
echo.

set /p AUTOSTART_CHOICE="Do you want Prompt Cowboy to start automatically with Windows? (Y/N, default Y): "
if /i "%AUTOSTART_CHOICE%"=="N" (
    echo [i] Autostart disabled.
    reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "PromptCowboyOverlay" /f >nul 2>&1
) else (
    echo [OK] Autostart enabled on Windows Boot.
    reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "PromptCowboyOverlay" /t REG_SZ /d "\"%SCRIPT_DIR%Start-Overlay.bat\"" /f >nul 2>&1
)

echo.
echo Launching Prompt Cowboy Floating Widget now...
start "" electron .
exit
