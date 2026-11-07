$ErrorActionPreference = 'Stop'
$ghRoot = $PSScriptRoot
$ghData = Join-Path $ghRoot 'data'
$ghVersion = (Get-Content -LiteralPath (Join-Path $ghRoot 'package.json') -Raw | ConvertFrom-Json).version
function Get-GrowHighIdentity([string]$value) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($value))).Replace('-','').ToLowerInvariant()).Substring(0,16) } finally { $sha.Dispose() }
}
$ghIdentities = @((Get-GrowHighIdentity ($ghRoot + '|' + $ghData)), (Get-GrowHighIdentity ($ghRoot + '|' + $ghData + '|' + $ghVersion)))
foreach ($ghPort in 4180..4190) {
  try {
    $ghResponse = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $ghPort + '/') -UseBasicParsing -TimeoutSec 1
    $ghIdentity = [string]$ghResponse.Headers['X-Grow-High-Instance']
    if ($ghIdentities -notcontains $ghIdentity) { continue }
    $ghListeners = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $ghPort -State Listen -ErrorAction Stop)
    foreach ($ghListener in $ghListeners) {
      $ghProcessId = $ghListener.OwningProcess
      $ghProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $ghProcessId)
      if ($ghProcess.Name -ne 'node.exe' -or $ghProcess.CommandLine -notmatch 'server\.mjs') { continue }
      # Identity binds this listener to this application/data directory. Recheck before stopping it.
      $ghAgain = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $ghPort + '/') -UseBasicParsing -TimeoutSec 1
      $ghStill = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $ghPort -State Listen -ErrorAction Stop)
      if ([string]$ghAgain.Headers['X-Grow-High-Instance'] -eq $ghIdentity -and $ghStill.OwningProcess -contains $ghProcessId) {
        Write-Host ('Stopping this Grow High server on port ' + $ghPort + '...')
        Stop-Process -Id $ghProcessId -ErrorAction Stop
        Wait-Process -Id $ghProcessId -Timeout 5 -ErrorAction SilentlyContinue
      }
    }
  } catch { Write-Verbose $_.Exception.Message }
}
Set-Location -LiteralPath $ghRoot
$env:PORT = '4181'
$env:GH_FOREGROUND = '1'
Write-Host ('Starting Grow High v' + $ghVersion + ' from ' + $ghRoot)
& node (Join-Path $ghRoot 'launch.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Grow High did not start. Copy the error above into the chat.' }
