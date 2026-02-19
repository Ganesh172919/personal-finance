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

Wait-HttpOk -Url "http://127.0.0.1:3000/healthz" -TimeoutSeconds 240
Wait-HttpOk -Url "http://127.0.0.1:8001/health" -TimeoutSeconds 240
try {
  Wait-HttpOk -Url "http://127.0.0.1:5173/" -TimeoutSeconds 30
} catch {
  Write-Warning "Frontend dev server did not become reachable on :5173; continuing backend/API smoke checks."
}

$base = "http://127.0.0.1:3000"
$apiV1 = "$base/api/v1"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Write-Host "Fetching CSRF token..." -ForegroundColor Cyan
$csrf = Invoke-RestMethod -Method Get -Uri "$apiV1/auth/csrf" -WebSession $session -TimeoutSec 10
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

$register = Invoke-RestMethod -Method Post -Uri "$apiV1/auth/register" -WebSession $session -Headers $headers -ContentType "application/json" -Body $registerBody -TimeoutSec 20
$otp = [string]$register.dev_otp
if (-not $otp) {
  throw "Expected dev_otp in /auth/register response (console OTP mode). Configure EMAIL_* to use SMTP."
}

Write-Host "Verifying email with dev OTP..." -ForegroundColor Cyan
$verifyBody = @{ email = $email; otp = $otp } | ConvertTo-Json
$null = Invoke-RestMethod -Method Post -Uri "$apiV1/auth/verify-email" -WebSession $session -Headers $headers -ContentType "application/json" -Body $verifyBody -TimeoutSec 20

Write-Host "Fetching profile..." -ForegroundColor Cyan
$profile = Invoke-RestMethod -Method Get -Uri "$apiV1/auth/profile" -WebSession $session -TimeoutSec 20
if (-not $profile.id) { throw "Profile id missing" }

Write-Host "Creating a transaction..." -ForegroundColor Cyan
$txBody = @{
  amount = 1234
  category = "Smoke"
  description = "Smoke test transaction"
  date = (Get-Date).ToString("o")
  type = "expense"
} | ConvertTo-Json

$null = Invoke-RestMethod -Method Post -Uri "$apiV1/transactions" -WebSession $session -Headers $headers -ContentType "application/json" -Body $txBody -TimeoutSec 20

Write-Host "Fetching dashboard summary..." -ForegroundColor Cyan
$null = Invoke-RestMethod -Method Get -Uri "$apiV1/dashboard/summary" -WebSession $session -TimeoutSec 20

Write-Host "Fetching recent insights..." -ForegroundColor Cyan
$null = Invoke-RestMethod -Method Get -Uri "$apiV1/agent-outputs/recent?limit=5" -WebSession $session -TimeoutSec 20

Write-Host "Fetching app config..." -ForegroundColor Cyan
$null = Invoke-RestMethod -Method Get -Uri "$apiV1/config/me" -WebSession $session -Headers $headers -TimeoutSec 20

Write-Host "Validating vNext platform APIs..." -ForegroundColor Cyan

$plans = Invoke-RestMethod -Method Get -Uri "$apiV1/plans" -WebSession $session -Headers $headers -TimeoutSec 20
if (-not ($plans.plans | Where-Object { $_.id -eq "enterprise" })) {
  throw "Plan catalog missing enterprise tier"
}

$entitlements = Invoke-RestMethod -Method Get -Uri "$apiV1/entitlements/me" -WebSession $session -Headers $headers -TimeoutSec 20
if (-not $entitlements.limits.api_requests) { throw "Entitlements missing api_requests limit" }
if (-not $entitlements.limits.workflow_runs) { throw "Entitlements missing workflow_runs limit" }
if (-not $entitlements.limits.connector_sync_records) { throw "Entitlements missing connector_sync_records limit" }

$featureFlagKey = "automation.smoke.test"
$featureFlagUpsertBody = @{
  enabled = $true
  rollout_percent = 100
  metadata = @{ source = "smoke" }
} | ConvertTo-Json -Depth 10
$featureFlagUpsert = Invoke-RestMethod -Method Put -Uri "$apiV1/feature-flags/$featureFlagKey" -WebSession $session -Headers $headers -ContentType "application/json" -Body $featureFlagUpsertBody -TimeoutSec 20
if (-not $featureFlagUpsert.flag.enabled) { throw "Feature flag upsert failed" }

$featureFlags = Invoke-RestMethod -Method Get -Uri "$apiV1/feature-flags" -WebSession $session -Headers $headers -TimeoutSec 20
if (-not ($featureFlags.flags | Where-Object { $_.key -eq $featureFlagKey })) { throw "Feature flag list missing expected key" }

$catalog = Invoke-RestMethod -Method Get -Uri "$apiV1/marketplace/catalog" -WebSession $session -Headers $headers -TimeoutSec 20
$plugin = $catalog.plugins | Where-Object { $_.plugin_key -eq "finwise.connector.bank_stub" } | Select-Object -First 1
if (-not $plugin) { throw "Marketplace catalog missing finwise.connector.bank_stub" }

$installBody = @{
  plugin_key = "finwise.connector.bank_stub"
  version = "1.0.0"
} | ConvertTo-Json
$install = Invoke-RestMethod -Method Post -Uri "$apiV1/marketplace/install" -WebSession $session -Headers $headers -ContentType "application/json" -Body $installBody -TimeoutSec 25
if ($install.install.status -ne "installed") { throw "Marketplace plugin install failed" }

$plugins = Invoke-RestMethod -Method Get -Uri "$apiV1/plugins" -WebSession $session -Headers $headers -TimeoutSec 20
if (-not ($plugins.plugins | Where-Object { $_.plugin_key -eq "finwise.connector.bank_stub" })) { throw "Installed plugins missing expected plugin" }

$updateBody = @{ version = "1.0.0" } | ConvertTo-Json
$pluginUpdate = Invoke-RestMethod -Method Post -Uri "$apiV1/plugins/finwise.connector.bank_stub/update" -WebSession $session -Headers $headers -ContentType "application/json" -Body $updateBody -TimeoutSec 20
if ($pluginUpdate.plugin.status -ne "installed") { throw "Plugin update endpoint failed" }

$integrations = Invoke-RestMethod -Method Get -Uri "$apiV1/integrations" -WebSession $session -Headers $headers -TimeoutSec 20
if (-not ($integrations.connectors | Where-Object { $_.connector_key -eq "bank_stub" })) { throw "Integrations catalog missing bank_stub" }

$syncBody = @{ records_synced = 7 } | ConvertTo-Json
$sync = Invoke-RestMethod -Method Post -Uri "$apiV1/integrations/bank_stub/sync" -WebSession $session -Headers $headers -ContentType "application/json" -Body $syncBody -TimeoutSec 30
if ($sync.run.status -ne "succeeded") { throw "Integration sync failed" }

$history = Invoke-RestMethod -Method Get -Uri "$apiV1/integrations/bank_stub/history?limit=5" -WebSession $session -Headers $headers -TimeoutSec 20
if (-not $history.history -or $history.history.Count -lt 1) { throw "Integration history missing sync runs" }

$events = Invoke-RestMethod -Method Get -Uri "$apiV1/automation/events" -WebSession $session -Headers $headers -TimeoutSec 20
if (-not ($events.events | Where-Object { $_.event_type -eq "TransactionCreated" })) { throw "Automation event catalog missing TransactionCreated" }

$emitBody = @{
  event_type = "TransactionCreated"
  aggregate_type = "transaction"
  aggregate_id = "smoke-event"
  payload = @{ source = "smoke" }
} | ConvertTo-Json -Depth 10
$emit = Invoke-RestMethod -Method Post -Uri "$apiV1/automation/events/emit" -WebSession $session -Headers $headers -ContentType "application/json" -Body $emitBody -TimeoutSec 20
if (-not $emit.accepted) { throw "Automation event emit failed" }

$analytics = Invoke-RestMethod -Method Get -Uri "$apiV1/analytics/overview" -WebSession $session -Headers $headers -TimeoutSec 20
if (-not $analytics.metrics) { throw "Analytics overview missing metrics" }
if (-not $analytics.usage.connector_sync_records) { throw "Analytics usage missing connector_sync_records" }

$pluginUninstall = Invoke-RestMethod -Method Post -Uri "$apiV1/plugins/finwise.connector.bank_stub/uninstall" -WebSession $session -Headers $headers -TimeoutSec 20
if ($pluginUninstall.plugin.status -ne "disabled") { throw "Plugin uninstall failed" }

$featureFlagDelete = Invoke-RestMethod -Method Delete -Uri "$apiV1/feature-flags/$featureFlagKey" -WebSession $session -Headers $headers -TimeoutSec 20
if (-not $featureFlagDelete.deleted) { throw "Feature flag delete failed" }

Write-Host "Creating chat session + sending message..." -ForegroundColor Cyan
$chatSession = Invoke-RestMethod -Method Post -Uri "$apiV1/chat/sessions" -WebSession $session -Headers $headers -TimeoutSec 20
$sessionId = [string]$chatSession.id
if (-not $sessionId) { throw "Chat session id missing" }

$sendBody = @{ content = "Hello from smoke test. Create a comprehensive financial plan for me and suggest safe automations." } | ConvertTo-Json
$send = Invoke-RestMethod -Method Post -Uri "$apiV1/chat/sessions/$sessionId/messages" -WebSession $session -Headers $headers -ContentType "application/json" -Body $sendBody -TimeoutSec 60
if (-not $send.assistantMessage.content) { throw "Assistant message content missing" }

if ($send.assistantMessage.metadata -and $send.assistantMessage.metadata.toolCalls -and $send.assistantMessage.metadata.toolCalls.Count -gt 0) {
  Write-Host "Simulating an autopilot tool call..." -ForegroundColor Cyan
  $toolCall = $send.assistantMessage.metadata.toolCalls[0]
  $simulateBody = @{ tool_call = $toolCall } | ConvertTo-Json -Depth 20
  $sim = Invoke-RestMethod -Method Post -Uri "$apiV1/tools/simulate" -WebSession $session -Headers $headers -ContentType "application/json" -Body $simulateBody -TimeoutSec 25
  if (-not $sim.ok) { throw "Tool simulate failed" }

  Write-Host "Executing an autopilot tool call..." -ForegroundColor Cyan
  $execBody = @{ tool_call = $toolCall; confirm = $true; idempotency_key = [string]$toolCall.id } | ConvertTo-Json -Depth 20
  $exec = Invoke-RestMethod -Method Post -Uri "$apiV1/tools/execute" -WebSession $session -Headers $headers -ContentType "application/json" -Body $execBody -TimeoutSec 35
  if (-not $exec.ok) { throw "Tool execute failed" }
} else {
  Write-Warning "No toolCalls found in assistant message metadata; skipping tool-host smoke checks."
}

Write-Host "Smoke test passed." -ForegroundColor Green
