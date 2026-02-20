$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

try {
  Add-Type -AssemblyName System.Net.Http
} catch {
  # Best-effort: some hosts may already have it loaded or disallow Add-Type.
}

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

function Invoke-TransactionsCsvImport {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][Microsoft.PowerShell.Commands.WebRequestSession]$WebSession,
    [Parameter(Mandatory = $true)][hashtable]$Headers,
    [Parameter(Mandatory = $true)][string]$CsvText,
    [Parameter(Mandatory = $true)][string]$MappingJson,
    [string]$AccountId = ""
  )

  $handler = New-Object System.Net.Http.HttpClientHandler
  $handler.CookieContainer = $WebSession.Cookies
  $handler.UseCookies = $true

  $client = New-Object System.Net.Http.HttpClient($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(40)

  try {
    $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $Url)

    foreach ($k in $Headers.Keys) {
      $null = $req.Headers.TryAddWithoutValidation([string]$k, [string]$Headers[$k])
    }

    $multipart = New-Object System.Net.Http.MultipartFormDataContent
    $multipart.Add((New-Object System.Net.Http.StringContent($MappingJson, [System.Text.Encoding]::UTF8)), "mapping")
    if ($AccountId) {
      $multipart.Add((New-Object System.Net.Http.StringContent($AccountId, [System.Text.Encoding]::UTF8)), "account_id")
    }

    $fileBytes = [System.Text.Encoding]::UTF8.GetBytes($CsvText)
    $fileContent = [System.Net.Http.ByteArrayContent]::new($fileBytes)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("text/csv")
    $multipart.Add($fileContent, "file", "transactions.csv")

    $req.Content = $multipart

    $res = $client.SendAsync($req).GetAwaiter().GetResult()
    $body = $res.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $res.IsSuccessStatusCode) {
      throw "CSV import failed ($($res.StatusCode)): $body"
    }

    return $body | ConvertFrom-Json
  } finally {
    $client.Dispose()
    $handler.Dispose()
  }
}

function Assert-SseReady {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][Microsoft.PowerShell.Commands.WebRequestSession]$WebSession,
    [Parameter(Mandatory = $true)][hashtable]$Headers,
    [int]$TimeoutSeconds = 10
  )

  $handler = New-Object System.Net.Http.HttpClientHandler
  $handler.CookieContainer = $WebSession.Cookies
  $handler.UseCookies = $true

  $client = New-Object System.Net.Http.HttpClient($handler)
  $client.Timeout = [TimeSpan]::FromSeconds([Math]::Max(15, $TimeoutSeconds + 5))

  $req = $null
  $res = $null
  try {
    $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $Url)

    foreach ($k in $Headers.Keys) {
      $null = $req.Headers.TryAddWithoutValidation([string]$k, [string]$Headers[$k])
    }

    $res = $client.SendAsync($req, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
    if (-not $res.IsSuccessStatusCode) {
      $body = $res.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      throw "SSE stream failed ($($res.StatusCode)): $body"
    }

    $contentType = [string]$res.Content.Headers.ContentType
    if ($contentType -notmatch "text/event-stream") {
      throw "Expected text/event-stream but got: $contentType"
    }

    $stream = $res.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $buffer = New-Object byte[] 1024
    $sb = New-Object System.Text.StringBuilder
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    $readTask = $stream.ReadAsync($buffer, 0, $buffer.Length)
    while ((Get-Date) -lt $deadline) {
      if (-not $readTask.Wait(1000)) {
        continue
      }

      $read = $readTask.Result
      if ($read -le 0) {
        break
      }

      $chunk = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $read)
      $null = $sb.Append($chunk)
      if ($sb.ToString().Contains("event: ready")) {
        return
      }

      $readTask = $stream.ReadAsync($buffer, 0, $buffer.Length)
    }

    throw "SSE stream did not emit a ready event within ${TimeoutSeconds}s"
  } finally {
    if ($res) { $res.Dispose() }
    if ($req) { $req.Dispose() }
    $client.Dispose()
    $handler.Dispose()
  }
}

Write-Host "Smoke test (assumes services are already running)..." -ForegroundColor Cyan

Wait-HttpOk -Url "http://127.0.0.1:3000/healthz" -TimeoutSeconds 240
Wait-HttpOk -Url "http://127.0.0.1:8001/health" -TimeoutSeconds 240
try {
  Wait-HttpOk -Url "http://127.0.0.1:5173/" -TimeoutSeconds 30
} catch {
  Write-Warning "Frontend dev server did not become reachable on :5173; continuing backend/API smoke checks."
}

$pluginRuntimeHealthy = $false
try {
  Wait-HttpOk -Url "http://127.0.0.1:8788/health" -TimeoutSeconds 10
  $pluginRuntimeHealthy = $true
  Write-Host "Plugin runtime detected (8788)." -ForegroundColor Yellow
} catch {
  Write-Warning "Plugin runtime not reachable on :8788; plugin-runtime smoke checks will be skipped."
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

Write-Host "Validating SSE event stream..." -ForegroundColor Cyan
Assert-SseReady -Url "$apiV1/events/stream" -WebSession $session -Headers $headers -TimeoutSeconds 10

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

Write-Host "Validating canonical finance domain APIs..." -ForegroundColor Cyan

$accountBody = @{
  name = "Smoke Checking"
  type = "checking"
  currency = "USD"
} | ConvertTo-Json
$account = Invoke-RestMethod -Method Post -Uri "$apiV1/finance/accounts" -WebSession $session -Headers $headers -ContentType "application/json" -Body $accountBody -TimeoutSec 20
$accountId = [string]$account.account.id
if (-not $accountId) { throw "Finance account id missing" }

$periodKey = Get-Date -Format "yyyy-MM"
$budgetBody = @{
  category = "Smoke"
  amount = 123.45
  currency = "USD"
} | ConvertTo-Json
$budget = Invoke-RestMethod -Method Put -Uri "$apiV1/finance/budgets/$periodKey/allocations" -WebSession $session -Headers $headers -ContentType "application/json" -Body $budgetBody -TimeoutSec 20
if (-not $budget.allocation) { throw "Budget allocation upsert failed" }

$rulesBody = @{
  name = "Smoke recurring charge"
  cron = "0 9 1 * *"
  status = "active"
  merchant_name = "Smoke Merchant"
  category = "Smoke"
  amount_min = 1
  amount_max = 100
} | ConvertTo-Json
$ruleCreated = Invoke-RestMethod -Method Post -Uri "$apiV1/finance/recurring" -WebSession $session -Headers $headers -ContentType "application/json" -Body $rulesBody -TimeoutSec 20
if (-not $ruleCreated.rule) { throw "Recurring rule create failed" }

Write-Host "Importing transactions via CSV ingestion endpoint..." -ForegroundColor Cyan
$csv = @"
Amount,Date,Description,Merchant,Category,Type
12.34,2026-02-01,Coffee,Blue Bottle,Food,expense
1000.00,2026-02-02,Salary,Employer Inc,Income,income
"@
$mappingJson = (@{
  amount = "Amount"
  date = "Date"
  description = "Description"
  merchant = "Merchant"
  category = "Category"
  type = "Type"
} | ConvertTo-Json -Compress)

$csvImport = Invoke-TransactionsCsvImport -Url "$apiV1/integrations/transactions_csv/import" -WebSession $session -Headers $headers -CsvText $csv -MappingJson $mappingJson -AccountId $accountId
if (-not $csvImport.ok) { throw "CSV import response missing ok=true" }
if ($csvImport.inserted -lt 1) { throw "CSV import inserted < 1" }

$merchants = Invoke-RestMethod -Method Get -Uri "$apiV1/finance/merchants?limit=50" -WebSession $session -Headers $headers -TimeoutSec 20
if (-not $merchants.merchants -or $merchants.merchants.Count -lt 1) { throw "Merchants list missing seeded merchants from CSV import" }

Write-Host "Validating vNext platform APIs..." -ForegroundColor Cyan

$plans = Invoke-RestMethod -Method Get -Uri "$apiV1/plans" -WebSession $session -Headers $headers -TimeoutSec 20
if (-not ($plans.plans | Where-Object { $_.id -eq "enterprise" })) {
  throw "Plan catalog missing enterprise tier"
}

$entitlements = Invoke-RestMethod -Method Get -Uri "$apiV1/entitlements/me" -WebSession $session -Headers $headers -TimeoutSec 20
if (-not $entitlements.limits.api_requests) { throw "Entitlements missing api_requests limit" }
if (-not $entitlements.limits.autopilot_actions) { throw "Entitlements missing autopilot_actions limit" }
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

if ($pluginRuntimeHealthy) {
  $sampleCatalog = $catalog.plugins | Where-Object { $_.plugin_key -eq "finwise.sample" } | Select-Object -First 1
  if (-not $sampleCatalog) { throw "Marketplace catalog missing finwise.sample" }

  Write-Host "Installing sample plugin (finwise.sample)..." -ForegroundColor Cyan
  $sampleInstallBody = @{
    plugin_key = "finwise.sample"
    version = "1.0.0"
  } | ConvertTo-Json
  $sampleInstall = Invoke-RestMethod -Method Post -Uri "$apiV1/marketplace/install" -WebSession $session -Headers $headers -ContentType "application/json" -Body $sampleInstallBody -TimeoutSec 25
  if ($sampleInstall.install.status -ne "installed") { throw "Marketplace plugin install failed (finwise.sample)" }

  Write-Host "Simulating plugin tool (plugin.finwise.sample.echo)..." -ForegroundColor Cyan
  $pluginToolCall = @{
    id = "smoke_plugin_echo"
    title = "Echo"
    description = "Smoke test echo"
    tool = "plugin.finwise.sample.echo"
    args = @{ message = "hello from plugin smoke" }
    requires_confirmation = $false
    risk = "low"
  }
  $pluginSimBody = @{ tool_call = $pluginToolCall } | ConvertTo-Json -Depth 10
  $pluginSim = Invoke-RestMethod -Method Post -Uri "$apiV1/tools/simulate" -WebSession $session -Headers $headers -ContentType "application/json" -Body $pluginSimBody -TimeoutSec 25
  if (-not $pluginSim.ok) { throw "Plugin tool simulate failed" }

  Write-Host "Executing plugin tool (plugin.finwise.sample.echo)..." -ForegroundColor Cyan
  $pluginExecBody = @{ tool_call = $pluginToolCall; confirm = $true; idempotency_key = "smoke_plugin_echo" } | ConvertTo-Json -Depth 10
  $pluginExec = Invoke-RestMethod -Method Post -Uri "$apiV1/tools/execute" -WebSession $session -Headers $headers -ContentType "application/json" -Body $pluginExecBody -TimeoutSec 25
  if (-not $pluginExec.ok) { throw "Plugin tool execute failed" }
  if (-not $pluginExec.result.echoed) { throw "Plugin tool execute result missing echoed" }
}

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

Write-Host "Validating workflow templates from installed plugins..." -ForegroundColor Cyan
$templates = Invoke-RestMethod -Method Get -Uri "$apiV1/workflows/templates" -WebSession $session -Headers $headers -TimeoutSec 20
if (-not $templates.templates -or $templates.templates.Count -lt 1) { throw "Expected workflow templates from installed plugins" }
if (-not ($templates.templates | Where-Object { $_.plugin_key -eq "finwise.connector.bank_stub" })) { throw "Workflow templates missing bank_stub plugin entries" }

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

if ($pluginRuntimeHealthy) {
  $sampleUninstall = Invoke-RestMethod -Method Post -Uri "$apiV1/plugins/finwise.sample/uninstall" -WebSession $session -Headers $headers -TimeoutSec 20
  if ($sampleUninstall.plugin.status -ne "disabled") { throw "Sample plugin uninstall failed" }
}

$featureFlagDelete = Invoke-RestMethod -Method Delete -Uri "$apiV1/feature-flags/$featureFlagKey" -WebSession $session -Headers $headers -TimeoutSec 20
if (-not $featureFlagDelete.deleted) { throw "Feature flag delete failed" }

Write-Host "Creating chat session + sending message..." -ForegroundColor Cyan
$chatSession = Invoke-RestMethod -Method Post -Uri "$apiV1/chat/sessions" -WebSession $session -Headers $headers -TimeoutSec 20
$sessionId = [string]$chatSession.id
if (-not $sessionId) { throw "Chat session id missing" }

$sendBody = @{ content = "Hello from smoke test. Create a comprehensive financial plan for me and suggest safe automations." } | ConvertTo-Json
$send = Invoke-RestMethod -Method Post -Uri "$apiV1/chat/sessions/$sessionId/messages" -WebSession $session -Headers $headers -ContentType "application/json" -Body $sendBody -TimeoutSec 60
if (-not $send.assistantMessage.content) { throw "Assistant message content missing" }

$runId = ""
if ($send.assistantMessage.metadata) {
  $runId = [string]$send.assistantMessage.metadata.autopilotRunId
  if (-not $runId) { $runId = [string]$send.assistantMessage.metadata.autopilot_run_id }
}

if ($runId) {
  Write-Host "Simulating autopilot run..." -ForegroundColor Cyan
  $simRunBody = @{ run_id = $runId } | ConvertTo-Json
  $simRun = Invoke-RestMethod -Method Post -Uri "$apiV1/autopilot/simulate" -WebSession $session -Headers $headers -ContentType "application/json" -Body $simRunBody -TimeoutSec 35
  if (-not $simRun.ok) { throw "Autopilot simulate failed" }

  Write-Host "Approving autopilot run..." -ForegroundColor Cyan
  $approveBody = @{ run_id = $runId; approve_all = $true } | ConvertTo-Json
  $approved = Invoke-RestMethod -Method Post -Uri "$apiV1/autopilot/approve" -WebSession $session -Headers $headers -ContentType "application/json" -Body $approveBody -TimeoutSec 25
  if (-not $approved.ok) { throw "Autopilot approve failed" }

  Write-Host "Executing autopilot run..." -ForegroundColor Cyan
  $execRunBody = @{ run_id = $runId } | ConvertTo-Json
  $execRun = Invoke-RestMethod -Method Post -Uri "$apiV1/autopilot/execute" -WebSession $session -Headers $headers -ContentType "application/json" -Body $execRunBody -TimeoutSec 60
  if (-not $execRun.ok) { throw "Autopilot execute failed" }
} elseif ($send.assistantMessage.metadata -and $send.assistantMessage.metadata.toolCalls -and $send.assistantMessage.metadata.toolCalls.Count -gt 0) {
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
  Write-Warning "No autopilotRunId or toolCalls found in assistant message metadata; skipping tool-host smoke checks."
}

Write-Host "Smoke test passed." -ForegroundColor Green
