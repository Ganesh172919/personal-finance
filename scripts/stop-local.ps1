$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$pidsPath = Join-Path $repoRoot ".tmp\\local-pids.json"

function Stop-If-Running {
  param([Parameter(Mandatory = $true)][int]$ProcessId)
  try {
    $p = Get-Process -Id $ProcessId -ErrorAction Stop
    & taskkill /PID $ProcessId /T /F | Out-Null
    Write-Host "Stopped PID $ProcessId ($($p.ProcessName))." -ForegroundColor Yellow
  } catch {
    # already stopped
  }
}

function Stop-ListenersOnPorts {
  param([Parameter(Mandatory = $true)][int[]]$Ports)

  $allowedNames = @("node", "python", "py", "cmd", "npm")
  $seen = New-Object 'System.Collections.Generic.HashSet[int]'

  foreach ($port in $Ports) {
    $listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
      $ownedProcessId = [int]$listener.OwningProcess
      if (-not $seen.Add($ownedProcessId)) {
        continue
      }
      try {
        $proc = Get-Process -Id $ownedProcessId -ErrorAction Stop
        if ($allowedNames -contains $proc.ProcessName.ToLowerInvariant()) {
          & taskkill /PID $ownedProcessId /T /F | Out-Null
          Write-Host "Stopped PID $ownedProcessId on port $port ($($proc.ProcessName))." -ForegroundColor Yellow
        }
      } catch {
        # process already gone
      }
    }
  }
}

if (Test-Path $pidsPath) {
  $data = Get-Content $pidsPath -Raw | ConvertFrom-Json

  if ($data.server.pid) { Stop-If-Running -ProcessId ([int]$data.server.pid) }
  if ($data.client.pid) { Stop-If-Running -ProcessId ([int]$data.client.pid) }
  if ($data.ai_core.pid) { Stop-If-Running -ProcessId ([int]$data.ai_core.pid) }

  Remove-Item $pidsPath -Force
}

Stop-ListenersOnPorts -Ports @(3000, 5173, 8001)

Write-Host "Local stack stopped." -ForegroundColor Green
