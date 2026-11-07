@echo off
cd /d "%~dp0"
title Grow High - keep this window open
set GH_FOREGROUND=1
echo Keep this window open while using Grow High.
node launch.mjs
if errorlevel 1 pause
