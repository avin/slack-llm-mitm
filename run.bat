@echo off
start "" pwsh -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0\start-proxy-and-slack.ps1"
exit /b