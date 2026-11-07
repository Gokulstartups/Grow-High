@echo off
setlocal
cd /d "%~dp0"
title Grow High - keep this window open
set "PORT=4181"
set "GH_FOREGROUND=1"
echo Grow High will choose an available port and open your browser.
node launch.mjs
if errorlevel 1 pause
