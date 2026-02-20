param(
  [switch]$SkipLocalRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Workdir,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan

  Push-Location $Workdir
  try {
    & $Action
  } finally {
    Pop-Location
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
    npm ci
    if ($LASTEXITCODE -ne 0) {
      throw "npm ci failed in $ProjectPath"
    }
  } finally {
    Pop-Location
  }
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
  $venvPython = Join-Path $repoRoot "server\\AI_Core\\.venv\\Scripts\\python.exe"
  if (Test-Path $venvPython) {
    return @{
      Command = $venvPython
      Prefix = @()
      Label = $venvPython
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

  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    if (Test-PythonCommand -Command "py" -Prefix @("-3")) {
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

  throw "No Python launcher found for AI Core quality checks."
}

function Get-ProviderPolicyMatches {
  param([Parameter(Mandatory = $true)][string]$RootPath)

  $pattern = "\\bopenai\\b|OPENAI_"

  $rg = Get-Command rg -ErrorAction SilentlyContinue
  if ($rg) {
    $providerMatches = & rg -n "(?i)$pattern" -S `
      --glob "!node_modules/**" `
      --glob "!.git/**" `
      --glob "!**/.venv/**" `
      --glob "!**/.pytest_cache/**" `
      --glob "!**/.ruff_cache/**" `
      --glob "!**/__pycache__/**" `
      --glob "!**/dist/**" `
      --glob "!**/*.log" `
      --glob "!.github/workflows/ci.yml" `
      --glob "!scripts/quality-gate.ps1" `
      --glob "!**/package-lock.json" `
      --glob "!**/pnpm-lock.yaml" `
      --glob "!**/yarn.lock" `
      --glob "!**/poetry.lock"

    if ($LASTEXITCODE -eq 0) {
      return $providerMatches
    }

    if ($LASTEXITCODE -gt 1) {
      throw "Provider policy scan failed."
    }

    return $null
  }

  Write-Warning "rg (ripgrep) not found; using slower PowerShell scan for provider policy."

  $excludedPathRegexes = @(
    "[/\\\\]node_modules[/\\\\]",
    "[/\\\\]\\.git[/\\\\]",
    "[/\\\\]\\.venv[/\\\\]",
    "[/\\\\]\\.pytest_cache[/\\\\]",
    "[/\\\\]\\.ruff_cache[/\\\\]",
    "[/\\\\]__pycache__[/\\\\]",
    "[/\\\\]dist[/\\\\]"
  )

  $excludedFileRegex = "\\.(log)$"
  $excludedFileNames = @("package-lock.json", "pnpm-lock.yaml", "yarn.lock", "poetry.lock", "ci.yml", "quality-gate.ps1")

  $matches = New-Object System.Collections.Generic.List[string]
  foreach ($file in Get-ChildItem -Path $RootPath -Recurse -File -Force) {
    $fullName = [string]$file.FullName
    if ($excludedFileNames -contains $file.Name) {
      continue
    }

    if ($file.Extension -and $file.Extension -match $excludedFileRegex) {
      continue
    }

    $skip = $false
    foreach ($regex in $excludedPathRegexes) {
      if ($fullName -match $regex) {
        $skip = $true
        break
      }
    }
    if ($skip) {
      continue
    }

    try {
      $hits = Select-String -Path $fullName -Pattern $pattern -CaseSensitive:$false -ErrorAction SilentlyContinue
      foreach ($hit in $hits) {
        $matches.Add("$($hit.Path):$($hit.LineNumber):$($hit.Line.Trim())") | Out-Null
        if ($matches.Count -ge 25) {
          return $matches
        }
      }
    } catch {
      continue
    }
  }

  if ($matches.Count -gt 0) {
    return $matches
  }

  return $null
}

Invoke-Step -Name "Provider policy: Gemini-only" -Workdir $repoRoot -Action {
  $providerMatches = Get-ProviderPolicyMatches -RootPath $repoRoot

  if ($providerMatches) {
    Write-Host $providerMatches -ForegroundColor Yellow
    throw "Gemini-only policy failed: found OpenAI references."
  }
}

Invoke-Step -Name "Server: typecheck + tests" -Workdir (Join-Path $repoRoot "server") -Action {
  Ensure-NodeDeps -ProjectPath (Join-Path $repoRoot "server")
  npm run check
  if ($LASTEXITCODE -ne 0) { throw "Server typecheck failed" }
  npm audit --omit=dev --audit-level=high
  if ($LASTEXITCODE -ne 0) { throw "Server npm audit failed" }
  npm run test:ci
  if ($LASTEXITCODE -ne 0) { throw "Server tests failed" }
}

Invoke-Step -Name "SDK: generate + check" -Workdir (Join-Path $repoRoot "packages\\sdk-ts") -Action {
  Ensure-NodeDeps -ProjectPath (Join-Path $repoRoot "packages\\sdk-ts")
  npm run generate
  if ($LASTEXITCODE -ne 0) { throw "SDK generation failed" }
  npm run check
  if ($LASTEXITCODE -ne 0) { throw "SDK typecheck failed" }
}

Invoke-Step -Name "Client: lint + build" -Workdir (Join-Path $repoRoot "client") -Action {
  Ensure-NodeDeps -ProjectPath (Join-Path $repoRoot "client")
  npm run lint
  if ($LASTEXITCODE -ne 0) { throw "Client lint failed" }
  npm audit --omit=dev --audit-level=high
  if ($LASTEXITCODE -ne 0) { throw "Client npm audit failed" }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Client build failed" }
}

$aiCorePython = Resolve-AiCorePython
Invoke-Step -Name "AI Core: ruff + pytest" -Workdir (Join-Path $repoRoot "server\\AI_Core") -Action {
  & $aiCorePython.Command @($aiCorePython.Prefix + @("-m", "pip", "install", "-r", "requirements.txt"))
  if ($LASTEXITCODE -ne 0) { throw "AI Core dependency install failed using '$($aiCorePython.Label)'" }

  & $aiCorePython.Command @($aiCorePython.Prefix + @("-m", "ruff", "check", "tests"))
  if ($LASTEXITCODE -ne 0) { throw "AI Core ruff check failed" }

  & $aiCorePython.Command @($aiCorePython.Prefix + @("-m", "pytest", "-q"))
  if ($LASTEXITCODE -ne 0) { throw "AI Core pytest failed" }
}

Invoke-Step -Name "SDK (py): compile" -Workdir (Join-Path $repoRoot "packages\\sdk-py") -Action {
  & $aiCorePython.Command @($aiCorePython.Prefix + @("-m", "compileall", "-q", "finwise_sdk"))
  if ($LASTEXITCODE -ne 0) { throw "Python SDK compile failed" }
}

if (-not $SkipLocalRun) {
  Invoke-Step -Name "Local stack verify (start -> smoke -> stop)" -Workdir $repoRoot -Action {
    & (Join-Path $repoRoot "scripts\\verify-local.ps1")
    if ($LASTEXITCODE -ne 0) { throw "Local verification failed" }
  }
}

Write-Host ""
Write-Host "All quality gates passed." -ForegroundColor Green
