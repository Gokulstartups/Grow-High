@echo off
setlocal
cd /d "%~dp0"
title Grow High - Direct Server
set "PORT=4180"
echo Grow High direct startup
echo Folder: %CD%
echo Keep this window open while using the software.
echo After the ready message, open http://127.0.0.1:4180 in Chrome or Edge.
echo.
if exist "%ProgramFiles%\nodejs\node.exe" (
  "%ProgramFiles%\nodejs\node.exe" server.mjs
) else (
  node server.mjs
)
echo.
echo The server has stopped. Please copy the error above into the chat.
pause
