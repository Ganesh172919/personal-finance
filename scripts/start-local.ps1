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

function Test-LocalPortOpen {
  param([Parameter(Mandatory = $true)][int]$Port)

  try {
    return (Test-NetConnection -ComputerName "127.0.0.1" -Port $Port -InformationLevel Quiet)
  } catch {
    return $false
  }
}

function Wait-PortOpen {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [int]$TimeoutSeconds = 180,
    [int]$IntervalSeconds = 2
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-LocalPortOpen -Port $Port) {
      return
    }
    Start-Sleep -Seconds $IntervalSeconds
  }

  throw "Timed out waiting for port $Port to accept connections"
}

function Ensure-DockerComposeServices {
  param([Parameter(Mandatory = $true)][string[]]$Services)

  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) {
    throw "Docker is required to auto-start infrastructure services ($($Services -join ', ')). Install Docker Desktop or run MongoDB/Redis locally."
  }

  $dockerDaemonReady = $false
  try {
    & docker info *> $null
    $dockerDaemonReady = $LASTEXITCODE -eq 0
  } catch {
    $dockerDaemonReady = $false
  }

  if (-not $dockerDaemonReady) {
    throw "Docker daemon is not available. Start Docker Desktop or run MongoDB/Redis locally."
  }

  $composeSubcommandOk = $false
  try {
    & docker compose version *> $null
    $composeSubcommandOk = $LASTEXITCODE -eq 0
  } catch {
    $composeSubcommandOk = $false
  }

  if ($composeSubcommandOk) {
    & docker compose up -d @Services *> $null
    if ($LASTEXITCODE -ne 0) {
      throw "docker compose up failed"
    }
    return
  }

  $dockerCompose = Get-Command docker-compose -ErrorAction SilentlyContinue
  if (-not $dockerCompose) {
    throw "Docker Compose not found. Install Docker Desktop or docker-compose."
  }

  & docker-compose up -d @Services *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "docker-compose up failed"
  }
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

function Ensure-PortsAvailable {
  param([Parameter(Mandatory = $true)][int[]]$Ports)

  $allowedNames = @("node", "python", "py", "cmd", "npm")
  $seen = New-Object "System.Collections.Generic.HashSet[int]"
  $blocked = @()

  foreach ($port in $Ports) {
    $listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
      $ownedProcessId = [int]$listener.OwningProcess
      if (-not $seen.Add($ownedProcessId)) {
        continue
      }

      try {
        $proc = Get-Process -Id $ownedProcessId -ErrorAction Stop
        $name = $proc.ProcessName.ToLowerInvariant()

        if ($allowedNames -contains $name) {
          & taskkill /PID $ownedProcessId /T /F | Out-Null
          Write-Host "Stopped PID $ownedProcessId on port $port ($($proc.ProcessName))." -ForegroundColor Yellow
          continue
        }

        $blocked += "${port}:$($proc.ProcessName)($ownedProcessId)"
      } catch {
        # process already gone
      }
    }
  }

  if ($blocked.Count -gt 0) {
    throw "Required local ports are occupied by non-dev processes: $($blocked -join ', ')."
  }
}

function Ensure-NodeDeps {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectPath,
    [string[]]$RequiredPaths = @()
  )

  $nodeModulesPath = Join-Path $ProjectPath "node_modules"
  $needsInstall = -not (Test-Path $nodeModulesPath)

  if (-not $needsInstall -and $RequiredPaths.Count -gt 0) {
    foreach ($relativePath in $RequiredPaths) {
      $fullPath = Join-Path $ProjectPath $relativePath
      if (-not (Test-Path $fullPath)) {
        $needsInstall = $true
        Write-Warning "Detected incomplete dependency install in $ProjectPath (missing: $relativePath). Reinstalling."
        break
      }
    }
  }

  if (-not $needsInstall) {
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

function Ensure-SdkTsReady {
  $sdkPath = Join-Path $repoRoot "packages\\sdk-ts"
  Ensure-NodeDeps -ProjectPath $sdkPath -RequiredPaths @("node_modules\\openapi-typescript-codegen\\bin\\index.js")

  $distIndexPath = Join-Path $sdkPath "dist\\index.js"
  if (Test-Path $distIndexPath) {
    return
  }

  Write-Host "Building local SDK package (packages/sdk-ts)..." -ForegroundColor Cyan
  Push-Location $sdkPath
  try {
    & npm run generate
    if ($LASTEXITCODE -ne 0) {
      throw "npm run generate failed in $sdkPath"
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

function Get-PythonVersionInfo {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [string[]]$Prefix = @()
  )

  try {
    $args = @($Prefix + @("-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"))
    $lines = & $Command @args 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $lines) {
      return $null
    }

    $raw = $lines | Select-Object -First 1
    if (-not $raw) {
      return $null
    }

    $text = [string]$raw
    $parts = $text.Trim().Split(".")
    if ($parts.Length -lt 2) {
      return $null
    }

    $major = 0
    $minor = 0
    $patch = 0
    if (-not [int]::TryParse($parts[0], [ref]$major)) {
      return $null
    }
    if (-not [int]::TryParse($parts[1], [ref]$minor)) {
      return $null
    }
    if ($parts.Length -ge 3) {
      [int]::TryParse($parts[2], [ref]$patch) | Out-Null
    }

    return @{
      Major = $major
      Minor = $minor
      Patch = $patch
      Raw = $text.Trim()
    }
  } catch {
    return $null
  }
}

function Assert-AiCorePythonVersion {
  param([Parameter(Mandatory = $true)][hashtable]$PythonConfig)

  $version = Get-PythonVersionInfo -Command $PythonConfig.Command -Prefix $PythonConfig.Prefix
  if (-not $version) {
    throw "Unable to determine Python version for '$($PythonConfig.Label)'."
  }

  if ($version.Major -ne 3 -or $version.Minor -lt 10) {
    throw "Python 3.10+ is required for AI Core. Found: $($version.Raw) via '$($PythonConfig.Label)'."
  }

  if ($version.Minor -lt 11) {
    Write-Warning "Python $($version.Raw) detected. Python 3.11+ is recommended for best AI Core dependency compatibility."
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
      & $VenvPython -c "import fastapi,uvicorn,langgraph,langchain_google_genai,pydantic" *> $null
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
    if ($existing.worker.pid) { Stop-If-Running -ProcessId ([int]$existing.worker.pid) }
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
$workerLog = Join-Path $tmpDir "worker.log"
$workerErrLog = Join-Path $tmpDir "worker.err.log"

Ensure-NodeDeps -ProjectPath (Join-Path $repoRoot "server") -RequiredPaths @("node_modules\\tsx\\dist\\cli.mjs")
Ensure-NodeDeps -ProjectPath (Join-Path $repoRoot "client") -RequiredPaths @("node_modules\\vite\\bin\\vite.js")
Ensure-SdkTsReady

$aiCorePythonConfig = Resolve-AiCorePython
Assert-AiCorePythonVersion -PythonConfig $aiCorePythonConfig
$aiCoreVenvPython = Ensure-AiCoreVenvPython -PythonConfig $aiCorePythonConfig
Ensure-AiCoreDeps -PythonConfig $aiCorePythonConfig -VenvPython $aiCoreVenvPython

# MongoDB + Redis are optional for local startup.
# Mongo: server falls back to in-memory MongoDB in non-production when the primary URI is unavailable.
if (-not (Test-LocalPortOpen -Port 27017)) {
  Write-Host "MongoDB not detected on :27017. Attempting Docker Compose bootstrap..." -ForegroundColor Cyan
  try {
    Ensure-DockerComposeServices -Services @("mongodb")
    Wait-PortOpen -Port 27017 -TimeoutSeconds 240
  } catch {
    Write-Warning "Could not auto-start MongoDB via Docker. Continuing; server will use non-production in-memory MongoDB fallback."
  }
}

$redisAvailable = $false
if (Test-LocalPortOpen -Port 6379) {
  $redisAvailable = $true
} else {
  Write-Host "Redis not detected on :6379. Attempting Docker Compose bootstrap..." -ForegroundColor Cyan
  try {
    Ensure-DockerComposeServices -Services @("redis")
    Wait-PortOpen -Port 6379 -TimeoutSeconds 240
    $redisAvailable = $true
  } catch {
    Write-Warning "Could not auto-start Redis via Docker. Continuing without Redis (worker disabled, in-memory fallbacks enabled)."
  }
}

if ($redisAvailable) {
  $env:REDIS_URL = "redis://127.0.0.1:6379"
  Write-Host "Set REDIS_URL=$($env:REDIS_URL) for this session." -ForegroundColor Yellow
} else {
  # Force-disable Redis for child processes even if .env has REDIS_URL set.
  $env:REDIS_URL = ""
}

# Force local dev mode for startup script workflows.
$env:NODE_ENV = "development"

if (-not (Is-Truthy -Value $env:ALLOW_SMTP_IN_LOCAL)) {
  $env:EMAIL_USER = ""
  $env:EMAIL_PASSWORD = ""
  $env:EMAIL_FROM = ""
  Write-Host "Using dev OTP mode for local auth. Set ALLOW_SMTP_IN_LOCAL=true to keep SMTP settings." -ForegroundColor Yellow
}

Ensure-PortsAvailable -Ports @(3000, 5173, 8001)

$serverProc = $null
$clientProc = $null
$aiProc = $null
$workerProc = $null

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

  $redisUrl = $env:REDIS_URL
  if ($redisUrl -and $redisUrl.Trim().Length -gt 0) {
    $env:WORKER_ENABLED = "true"
    Write-Host "Starting worker (BullMQ)..." -ForegroundColor Cyan
    $workerEntry = Join-Path $repoRoot "server\\node_modules\\tsx\\dist\\cli.mjs"
    if (-not (Test-Path $workerEntry)) {
      throw "Missing tsx entrypoint: $workerEntry"
    }
    $workerProc = Start-Process `
      -FilePath "node.exe" `
      -ArgumentList @($workerEntry, "src/worker.ts") `
      -WorkingDirectory (Join-Path $repoRoot "server") `
      -RedirectStandardOutput $workerLog `
      -RedirectStandardError $workerErrLog `
      -PassThru
  } else {
    Write-Host "REDIS_URL not set; skipping worker start. (Set REDIS_URL to enable BullMQ workers.)" -ForegroundColor Yellow
  }

  $workerPayload = $null
  if ($workerProc) {
    $workerPayload = @{ pid = $workerProc.Id; log = $workerLog; err = $workerErrLog }
  }

  $payload = @{
    startedAt = $startedAt
    server = @{ pid = $serverProc.Id; log = $serverLog; err = $serverErrLog }
    client = @{ pid = $clientProc.Id; log = $clientLog; err = $clientErrLog }
    ai_core = @{ pid = $aiProc.Id; log = $aiCoreLog; err = $aiCoreErrLog; python = $aiCoreVenvPython }
    worker = $workerPayload
  } | ConvertTo-Json -Depth 5

  $payload | Out-File -FilePath $pidsPath -Encoding utf8

  Write-Host "Waiting for services..." -ForegroundColor Cyan
  Wait-HttpOk -Url "http://127.0.0.1:3000/healthz" -TimeoutSeconds 240
  Wait-HttpOk -Url "http://127.0.0.1:8001/health" -TimeoutSeconds 240
  Wait-HttpOk -Url "http://127.0.0.1:5173/" -TimeoutSeconds 240
} catch {
  if ($serverProc) { Stop-If-Running -ProcessId $serverProc.Id }
  if ($clientProc) { Stop-If-Running -ProcessId $clientProc.Id }
  if ($aiProc) { Stop-If-Running -ProcessId $aiProc.Id }
  if ($workerProc) { Stop-If-Running -ProcessId $workerProc.Id }
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
if ($workerProc) {
  Write-Host "  worker: $workerLog"
  Write-Host "  worker err: $workerErrLog"
}
