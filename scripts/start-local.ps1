$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$tmpDir = Join-Path $repoRoot ".tmp"
$pidsPath = Join-Path $tmpDir "local-pids.json"

function Ensure-Dir {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Ensure-EnvFileFromExample {
  param(
    [Parameter(Mandatory = $true)][string]$TargetPath,
    [Parameter(Mandatory = $true)][string]$ExamplePath
  )

  if (-not (Test-Path $ExamplePath)) {
    throw "Missing required template file: $ExamplePath"
  }

  if (-not (Test-Path $TargetPath)) {
    Copy-Item -Path $ExamplePath -Destination $TargetPath
    Write-Host "Created default env file: $TargetPath" -ForegroundColor Yellow
    return
  }

  $templateKeys = @{}
  foreach ($line in Get-Content $ExamplePath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $separator = $line.IndexOf("=")
    if ($separator -le 0) {
      continue
    }

    $key = $line.Substring(0, $separator).Trim()
    if (-not $templateKeys.ContainsKey($key)) {
      $templateKeys[$key] = $line
    }
  }

  $existingKeys = New-Object "System.Collections.Generic.HashSet[string]"
  foreach ($line in Get-Content $TargetPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    $separator = $line.IndexOf("=")
    if ($separator -le 0) {
      continue
    }

    $key = $line.Substring(0, $separator).Trim()
    $null = $existingKeys.Add($key)
  }

  $missingLines = @()
  foreach ($key in $templateKeys.Keys) {
    if (-not $existingKeys.Contains($key)) {
      $missingLines += $templateKeys[$key]
    }
  }

  if ($missingLines.Count -gt 0) {
    Add-Content -Path $TargetPath -Value "" -Encoding utf8
    Add-Content -Path $TargetPath -Value "# Added from template by scripts/start-local.ps1" -Encoding utf8
    foreach ($line in $missingLines) {
      Add-Content -Path $TargetPath -Value $line -Encoding utf8
    }
    Write-Host "Added missing env keys to $TargetPath from template." -ForegroundColor Yellow
  }
}

function Wait-HttpOk {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$TimeoutSeconds = 180,
    [int]$IntervalSeconds = 2,
    [int]$RequiredPid = 0
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ($RequiredPid -gt 0) {
      $process = Get-Process -Id $RequiredPid -ErrorAction SilentlyContinue
      if (-not $process) {
        throw "Process PID $RequiredPid exited before endpoint became healthy: $Url"
      }
    }

    try {
      $res = Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 5
      if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 300) {
        return
      }
    } catch {
      Start-Sleep -Seconds $IntervalSeconds
      continue
    }
    Start-Sleep -Seconds $IntervalSeconds
  }

  throw "Timed out waiting for $Url"
}

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

function Ensure-NodeDeps {
  param([Parameter(Mandatory = $true)][string]$ProjectPath)

  $nodeModulesPath = Join-Path $ProjectPath "node_modules"
  if (Test-Path $nodeModulesPath) {
    return
  }

  Write-Host "Installing Node dependencies in $ProjectPath..." -ForegroundColor Cyan
  Push-Location $ProjectPath
  try {
    & npm ci
    if ($LASTEXITCODE -ne 0) {
      throw "npm ci failed in $ProjectPath"
    }
  } finally {
    Pop-Location
  }
}

function Is-Truthy {
  param([string]$Value)

  if (-not $Value) {
    return $false
  }

  $normalized = $Value.Trim().ToLowerInvariant()
  return @("1", "true", "yes", "on") -contains $normalized
}

function Test-PythonCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [string[]]$Prefix = @()
  )

  try {
    $args = @($Prefix + @("-c", "import sys; print(sys.version)"))
    & $Command @args *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Resolve-AiCorePython {
  $override = $env:AI_CORE_PYTHON
  if ($override) {
    return @{
      Command = $override
      Prefix = @()
      Label = $override
    }
  }

  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    if (Test-PythonCommand -Command "py" -Prefix @("-3.11")) {
      return @{
        Command = "py"
        Prefix = @("-3.11")
        Label = "py -3.11"
      }
    }

    if (Test-PythonCommand -Command "py" -Prefix @("-3")) {
      Write-Warning "Python 3.11 not found. Falling back to default Python 3 runtime for AI Core."
      return @{
        Command = "py"
        Prefix = @("-3")
        Label = "py -3"
      }
    }

    return @{
      Command = "py"
      Prefix = @()
      Label = "py"
    }
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return @{
      Command = "python"
      Prefix = @()
      Label = "python"
    }
  }

  throw "No Python launcher found. Install Python 3.11+ or set AI_CORE_PYTHON."
}

function Ensure-AiCoreDeps {
  param(
    [Parameter(Mandatory = $true)][hashtable]$PythonConfig,
    [Parameter(Mandatory = $true)][string]$VenvPython
  )

  $aiCorePath = Join-Path $repoRoot "server\\AI_Core"
  Push-Location $aiCorePath
  try {
    $depsReady = $false
    try {
      & $VenvPython -c "import fastapi,uvicorn" *> $null
      $depsReady = $LASTEXITCODE -eq 0
    } catch {
      $depsReady = $false
    }

    if ($depsReady) {
      return
    }

    Write-Host "Installing AI Core Python dependencies..." -ForegroundColor Cyan
    & $VenvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to upgrade pip for AI Core virtual environment"
    }

    & $VenvPython -m pip install -r requirements.txt

    if ($LASTEXITCODE -ne 0) {
      throw "Failed to install AI Core dependencies"
    }
  } finally {
    Pop-Location
  }
}

function Ensure-AiCoreVenvPython {
  param([Parameter(Mandatory = $true)][hashtable]$PythonConfig)

  $aiCorePath = Join-Path $repoRoot "server\\AI_Core"
  $venvPath = Join-Path $aiCorePath ".venv"
  $venvPython = Join-Path $venvPath "Scripts\\python.exe"

  if (-not (Test-Path $venvPython)) {
    Write-Host "Creating AI Core virtual environment (.venv)..." -ForegroundColor Cyan
    Push-Location $aiCorePath
    try {
      $venvArgs = @($PythonConfig.Prefix + @("-m", "venv", ".venv"))
      & $PythonConfig.Command @venvArgs
      if ($LASTEXITCODE -ne 0) {
        throw "Failed to create AI Core virtual environment"
      }
    } finally {
      Pop-Location
    }
  }

  if (-not (Test-Path $venvPython)) {
    throw "AI Core virtual environment python not found at $venvPython"
  }

  return $venvPython
}

Ensure-Dir -Path $tmpDir
Ensure-EnvFileFromExample -TargetPath (Join-Path $repoRoot "server\\.env") -ExamplePath (Join-Path $repoRoot "server\\.env.example")
Ensure-EnvFileFromExample -TargetPath (Join-Path $repoRoot "client\\.env") -ExamplePath (Join-Path $repoRoot "client\\.env.example")
Ensure-EnvFileFromExample -TargetPath (Join-Path $repoRoot "server\\AI_Core\\.env") -ExamplePath (Join-Path $repoRoot "server\\AI_Core\\.env.example")

if (Test-Path $pidsPath) {
  try {
    $existing = Get-Content $pidsPath -Raw | ConvertFrom-Json
    if ($existing.server.pid) { Stop-If-Running -ProcessId ([int]$existing.server.pid) }
    if ($existing.client.pid) { Stop-If-Running -ProcessId ([int]$existing.client.pid) }
    if ($existing.ai_core.pid) { Stop-If-Running -ProcessId ([int]$existing.ai_core.pid) }
  } catch {
    Write-Warning "Failed to parse existing $pidsPath. Continuing."
  }
}

$startedAt = (Get-Date).ToString("o")

$serverLog = Join-Path $tmpDir "server.log"
$serverErrLog = Join-Path $tmpDir "server.err.log"
$clientLog = Join-Path $tmpDir "client.log"
$clientErrLog = Join-Path $tmpDir "client.err.log"
$aiCoreLog = Join-Path $tmpDir "ai_core.log"
$aiCoreErrLog = Join-Path $tmpDir "ai_core.err.log"

Ensure-NodeDeps -ProjectPath (Join-Path $repoRoot "server")
Ensure-NodeDeps -ProjectPath (Join-Path $repoRoot "client")

$aiCorePythonConfig = Resolve-AiCorePython
$aiCoreVenvPython = Ensure-AiCoreVenvPython -PythonConfig $aiCorePythonConfig
Ensure-AiCoreDeps -PythonConfig $aiCorePythonConfig -VenvPython $aiCoreVenvPython

if (-not (Is-Truthy -Value $env:ALLOW_SMTP_IN_LOCAL)) {
  $env:EMAIL_USER = ""
  $env:EMAIL_PASSWORD = ""
  $env:EMAIL_FROM = ""
  Write-Host "Using dev OTP mode for local auth. Set ALLOW_SMTP_IN_LOCAL=true to keep SMTP settings." -ForegroundColor Yellow
}

$serverProc = $null
$clientProc = $null
$aiProc = $null

try {
  Write-Host "Starting server (Node)..." -ForegroundColor Cyan
  $serverEntry = Join-Path $repoRoot "server\\node_modules\\tsx\\dist\\cli.mjs"
  if (-not (Test-Path $serverEntry)) {
    throw "Missing tsx entrypoint: $serverEntry"
  }
  $serverProc = Start-Process `
    -FilePath "node.exe" `
    -ArgumentList @($serverEntry, "src/server.ts") `
    -WorkingDirectory (Join-Path $repoRoot "server") `
    -RedirectStandardOutput $serverLog `
    -RedirectStandardError $serverErrLog `
    -PassThru

  Write-Host "Starting client (Vite)..." -ForegroundColor Cyan
  $clientEntry = Join-Path $repoRoot "client\\node_modules\\vite\\bin\\vite.js"
  if (-not (Test-Path $clientEntry)) {
    throw "Missing Vite entrypoint: $clientEntry"
  }
  $clientProc = Start-Process `
    -FilePath "node.exe" `
    -ArgumentList @($clientEntry, "--host", "127.0.0.1", "--strictPort", "--port", "5173") `
    -WorkingDirectory (Join-Path $repoRoot "client") `
    -RedirectStandardOutput $clientLog `
    -RedirectStandardError $clientErrLog `
    -PassThru

  Write-Host "Starting AI Core (FastAPI) with $aiCoreVenvPython..." -ForegroundColor Cyan
  $aiCoreArgs = @("-m", "uvicorn", "api_service:app", "--host", "127.0.0.1", "--port", "8001")
  $aiProc = Start-Process `
    -FilePath $aiCoreVenvPython `
    -ArgumentList $aiCoreArgs `
    -WorkingDirectory (Join-Path $repoRoot "server\\AI_Core") `
    -RedirectStandardOutput $aiCoreLog `
    -RedirectStandardError $aiCoreErrLog `
    -PassThru

  $payload = @{
    startedAt = $startedAt
    server = @{ pid = $serverProc.Id; log = $serverLog; err = $serverErrLog }
    client = @{ pid = $clientProc.Id; log = $clientLog; err = $clientErrLog }
    ai_core = @{ pid = $aiProc.Id; log = $aiCoreLog; err = $aiCoreErrLog; python = $aiCoreVenvPython }
  } | ConvertTo-Json -Depth 5

  $payload | Out-File -FilePath $pidsPath -Encoding utf8

  Write-Host "Waiting for services..." -ForegroundColor Cyan
  Wait-HttpOk -Url "http://127.0.0.1:3000/api/test" -TimeoutSeconds 240
  Wait-HttpOk -Url "http://127.0.0.1:8001/health" -TimeoutSeconds 240
  Wait-HttpOk -Url "http://127.0.0.1:5173/" -TimeoutSeconds 240
} catch {
  if ($serverProc) { Stop-If-Running -ProcessId $serverProc.Id }
  if ($clientProc) { Stop-If-Running -ProcessId $clientProc.Id }
  if ($aiProc) { Stop-If-Running -ProcessId $aiProc.Id }
  throw
}

Write-Host "Local stack is up." -ForegroundColor Green
Write-Host "Logs:" -ForegroundColor Green
Write-Host "  server:  $serverLog"
Write-Host "  server err: $serverErrLog"
Write-Host "  client:  $clientLog"
Write-Host "  client err: $clientErrLog"
Write-Host "  ai_core: $aiCoreLog"
Write-Host "  ai_core err: $aiCoreErrLog"
