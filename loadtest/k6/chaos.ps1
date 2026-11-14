<#
.SYNOPSIS
  Chaos drill: SIGKILL one API replica and one AI Core replica, measure recovery.

.DESCRIPTION
  Companion to loadtest/k6/chaos.md. Run it while a k6 load is in flight
  (for example `k6 run loadtest/k6/load.js` in another terminal) against a
  `docker compose` stack started with at least 2 server replicas and 2 AI Core
  replicas:

      $env:SERVER_REPLICAS=2; $env:AI_CORE_REPLICAS=2; docker compose up -d --wait

  For each target the script
    1. picks one running replica of the service and `docker kill`s it,
    2. probes the public edge (http://127.0.0.1:8080/api/...) every second,
    3. waits for the killed container to report healthy again (compose's
       `restart: unless-stopped` brings it back),
    4. reports seconds to recovery and the number of failed edge probes.
  PASS = recovered in <= RecoverySeconds (default 30) for both services.

  NOT validated against real containers by the author (no Docker in the
  authoring environment): run it once in a scratch stack before relying on it.

.PARAMETER BaseUrl
  Edge URL. Default http://127.0.0.1:8080

.PARAMETER RecoverySeconds
  Recovery budget per service. Default 30 (plan target).

.PARAMETER ProbePath
  Per-service edge probe. API: /api/test (served by the gateway, no auth).
  AI Core: /api/python-health (the gateway calls AI Core /health).

.EXAMPLE
  ./loadtest/k6/chaos.ps1 -Service all
#>
[CmdletBinding()]
param(
  [ValidateSet("all", "server", "ai-core")]
  [string]$Service = "all",
  [string]$BaseUrl = "http://127.0.0.1:8080",
  [int]$RecoverySeconds = 30,
  [int]$MaxWaitSeconds = 120,
  [string]$ComposeFile = (Join-Path $PSScriptRoot "..\..\compose.yaml")
)

$ErrorActionPreference = "Stop"
$probeFor = @{ "server" = "/api/test"; "ai-core" = "/api/python-health" }

function Get-Replicas([string]$name) {
  $ids = docker compose -f $ComposeFile ps -q $name
  if ($LASTEXITCODE -ne 0) { throw "docker compose ps failed for $name" }
  return @($ids | Where-Object { $_ })
}

function Test-Edge([string]$path) {
  try {
    $r = Invoke-WebRequest -Uri ($BaseUrl.TrimEnd("/") + $path) -UseBasicParsing -TimeoutSec 3
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

function Get-Health([string]$id) {
  $h = docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $id 2>$null
  if ($LASTEXITCODE -ne 0) { return "missing" }
  return ($h | Select-Object -First 1).Trim()
}

function Get-StartedAt([string]$id) {
  $v = docker inspect -f "{{.State.StartedAt}}" $id 2>$null
  if ($LASTEXITCODE -ne 0) { return "missing" }
  return ($v | Select-Object -First 1).Trim()
}

function Invoke-Drill([string]$name) {
  $replicas = Get-Replicas $name
  if ($replicas.Count -lt 2) {
    Write-Warning "$name has $($replicas.Count) replica(s); the drill needs >= 2 for a zero-downtime result. Continuing anyway."
  }
  if ($replicas.Count -eq 0) { throw "No running $name containers. Is the stack up?" }

  $victim = $replicas | Get-Random
  $before = Get-StartedAt $victim
  $short = $victim.Substring(0, 12)
  Write-Host ("[{0}] killing {1} ({2}) ..." -f $name, $short, (Get-Date -Format o))
  docker kill $victim | Out-Null

  $start = Get-Date
  $failedProbes = 0
  $totalProbes = 0
  $recoveredAt = $null
  $path = $probeFor[$name]

  while (((Get-Date) - $start).TotalSeconds -lt $MaxWaitSeconds) {
    $totalProbes++
    if (-not (Test-Edge $path)) { $failedProbes++ }
    # A stale "healthy" can linger on a dead container: require a fresh start too.
    if (-not $recoveredAt -and (Get-StartedAt $victim) -ne $before -and (Get-Health $victim) -eq "healthy") {
      $recoveredAt = Get-Date
      break
    }
    Start-Sleep -Seconds 1
  }

  $seconds = if ($recoveredAt) { [math]::Round(($recoveredAt - $start).TotalSeconds, 1) } else { $null }
  $pass = ($null -ne $seconds) -and ($seconds -le $RecoverySeconds)
  [pscustomobject]@{
    Service        = $name
    Killed         = $short
    RecoverySecs   = $(if ($null -ne $seconds) { $seconds } else { "not recovered in ${MaxWaitSeconds}s" })
    EdgeProbes     = $totalProbes
    EdgeProbeFails = $failedProbes
    Result         = $(if ($pass) { "PASS" } else { "FAIL" })
  }
}

if (-not (Test-Edge "/healthz")) {
  Write-Warning "Edge $BaseUrl/healthz is not answering; start the stack first (docker compose up -d --wait)."
}

$targets = if ($Service -eq "all") { @("server", "ai-core") } else { @($Service) }
$results = foreach ($t in $targets) {
  Invoke-Drill $t
  if ($t -ne $targets[-1]) { Start-Sleep -Seconds 15 }  # let the first service settle
}
$results | Format-Table -AutoSize
if ($results | Where-Object { $_.Result -ne "PASS" }) { exit 1 }
