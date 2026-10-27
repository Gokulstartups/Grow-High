@echo off
cd /d "%~dp0"
title Restart Grow High - keep this window open
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Restart-Grow-High.ps1"
if errorlevel 1 pause
