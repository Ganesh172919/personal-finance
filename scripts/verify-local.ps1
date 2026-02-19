$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Host "Starting local stack..." -ForegroundColor Cyan

try {
  & (Join-Path $PSScriptRoot "start-local.ps1")

  Write-Host "Running smoke test..." -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot "smoke-running.ps1")

  Write-Host "Local verification passed." -ForegroundColor Green
} finally {
  Write-Host "Stopping local stack..." -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot "stop-local.ps1")
}
