$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

function Wait-HttpOk {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$TimeoutSeconds = 180,
    [int]$IntervalSeconds = 2
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
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

Write-Host "Smoke test (assumes services are already running)..." -ForegroundColor Cyan

Wait-HttpOk -Url "http://127.0.0.1:3000/api/test" -TimeoutSeconds 240
Wait-HttpOk -Url "http://127.0.0.1:8001/health" -TimeoutSeconds 240
try {
  Wait-HttpOk -Url "http://127.0.0.1:5173/" -TimeoutSeconds 30
} catch {
  Write-Warning "Frontend dev server did not become reachable on :5173; continuing backend/API smoke checks."
}

$base = "http://127.0.0.1:3000"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Write-Host "Fetching CSRF token..." -ForegroundColor Cyan
$csrf = Invoke-RestMethod -Method Get -Uri "$base/api/auth/csrf" -WebSession $session -TimeoutSec 10
$csrfToken = [string]$csrf.csrf_token
if (-not $csrfToken) { throw "CSRF token missing" }
$headers = @{
  "X-CSRF-Token" = $csrfToken
  "X-Smoke-Test" = "1"
}

$stamp = Get-Date -Format "yyyyMMddHHmmss"
$email = "smoke-$stamp@example.com"
$password = "Test1234!"

Write-Host "Registering user: $email" -ForegroundColor Cyan
$registerBody = @{
  name = "Smoke Test"
  email = $email
  password = $password
  phoneNumber = "0000000000"
} | ConvertTo-Json

$register = Invoke-RestMethod -Method Post -Uri "$base/api/auth/register" -WebSession $session -Headers $headers -ContentType "application/json" -Body $registerBody -TimeoutSec 20
$otp = [string]$register.dev_otp
if (-not $otp) {
  throw "Expected dev_otp in /auth/register response (console OTP mode). Configure EMAIL_* to use SMTP."
}

Write-Host "Verifying email with dev OTP..." -ForegroundColor Cyan
$verifyBody = @{ email = $email; otp = $otp } | ConvertTo-Json
$null = Invoke-RestMethod -Method Post -Uri "$base/api/auth/verify-email" -WebSession $session -Headers $headers -ContentType "application/json" -Body $verifyBody -TimeoutSec 20

Write-Host "Fetching profile..." -ForegroundColor Cyan
$profile = Invoke-RestMethod -Method Get -Uri "$base/api/auth/profile" -WebSession $session -TimeoutSec 20
if (-not $profile.id) { throw "Profile id missing" }

Write-Host "Creating a transaction..." -ForegroundColor Cyan
$txBody = @{
  amount = 1234
  category = "Smoke"
  description = "Smoke test transaction"
  date = (Get-Date).ToString("o")
  type = "expense"
} | ConvertTo-Json

$null = Invoke-RestMethod -Method Post -Uri "$base/api/transactions" -WebSession $session -Headers $headers -ContentType "application/json" -Body $txBody -TimeoutSec 20

Write-Host "Fetching dashboard summary..." -ForegroundColor Cyan
$null = Invoke-RestMethod -Method Get -Uri "$base/api/dashboard/summary" -WebSession $session -TimeoutSec 20

Write-Host "Fetching recent insights..." -ForegroundColor Cyan
$null = Invoke-RestMethod -Method Get -Uri "$base/api/agent-outputs/recent?limit=5" -WebSession $session -TimeoutSec 20

Write-Host "Fetching app config..." -ForegroundColor Cyan
$null = Invoke-RestMethod -Method Get -Uri "$base/api/config/me" -WebSession $session -Headers $headers -TimeoutSec 20

Write-Host "Creating chat session + sending message..." -ForegroundColor Cyan
$chatSession = Invoke-RestMethod -Method Post -Uri "$base/api/chat/sessions" -WebSession $session -Headers $headers -TimeoutSec 20
$sessionId = [string]$chatSession.id
if (-not $sessionId) { throw "Chat session id missing" }

$sendBody = @{ content = "Hello from smoke test. Give a short budgeting tip." } | ConvertTo-Json
$send = Invoke-RestMethod -Method Post -Uri "$base/api/chat/sessions/$sessionId/messages" -WebSession $session -Headers $headers -ContentType "application/json" -Body $sendBody -TimeoutSec 45
if (-not $send.assistantMessage.content) { throw "Assistant message content missing" }

Write-Host "Smoke test passed." -ForegroundColor Green
