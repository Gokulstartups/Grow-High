@echo off
cd /d "%~dp0"
powershell -NoProfile -Command "$pidFile = Join-Path (Get-Location) 'data/server.pid'; if (Test-Path -LiteralPath $pidFile) { $serverId = [int](Get-Content -LiteralPath $pidFile); $serverProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $serverId); if ($serverProcess -and $serverProcess.Name -eq 'node.exe' -and $serverProcess.CommandLine.Contains((Join-Path (Get-Location) 'server.mjs'))) { Stop-Process -Id $serverId; Write-Host 'Grow High stopped.' } else { Write-Host 'The saved process is no longer the Grow High server.' } } else { Write-Host 'No Grow High launcher process found.' }"
pause
