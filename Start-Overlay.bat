@echo off
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"
start "" electron .
exit
