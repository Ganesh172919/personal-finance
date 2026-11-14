---
title: "Recorded data and deployment review — 8 November 2026"
description: "Data integrity, calculated estimates distinction, and deployment review audit"
quadrant: record
audience: [developer, operator, auditor]
owner: "@qa-team"
status: reviewed
last_reviewed: 2026-11-08
review_every_days: 90
---

# Recorded data and deployment review — 8 November 2026

## Goal and scope

Users should be able to distinguish saved facts, their own editable assumptions,
calculated estimates and unavailable data. Empty records and dependency failures
must not become example household finances, peer statistics or success claims.
This is one focused batch over the existing, heavily modified working tree.
Existing records, environment secrets and unrelated changes are preserved.

## Corrections in this batch

- Finance budget recommendations: removed default category amounts and the
  fallback that called current-period spending a historical monthly average.
  Use recorded forecast history, its coverage and native currency; preserve
  cents and explicit selection when changing a buffer. Empty, loading and failed
  history have separate states. Apply is disabled without usable history or
  while saving. Rows now have keyboard-accessible checkbox semantics.
- Scenario stress testing: missing profile/account/portfolio facts remain
  unavailable; saved zero balances remain authoritative. Scenario presets are
  labelled editable assumptions. Removed invented shock and crisis-task amounts.
- Budget health: no synthetic peer cohort, income floor, alignment percentage or
  percentile is returned. The peer panel explains its unavailable data source.
  A saved zero/unknown APR does not become 18%. Debt savings and score gains are
  unknown rather than fabricated; recorded balance × APR / 12 is explicitly an
  interest estimate, not a guaranteed saving or extra-payment recommendation.
- AI income analysis: keep period totals separate from recorded monthly averages
  across the calendar span. Sparse/partial/invalid dates produce coverage notes
  or unknown monthly values. Saved monthly profile facts take precedence in
  plans. Request-local currency reaches dispatch, cache inputs and synthesis.
  Legacy master synthesis helpers use the same period-aware insight formatter.
- Browser follow-up: zero expenses no longer produce a fabricated 99.9-month
  runway or resilience rating; account simulations describe saved balances.
  Empty peer/rebalance tabs now show their own states and wrap on narrow screens.
- PDF follow-up: quoted titles stop at their matching quote; format flags are
  stripped before underscore sanitization. Explicit PDF income/expense questions
  use extractive lookup rather than seven unrelated agent steps.
- Deployment/browser follow-up: Workbox navigation fallback excludes `/api`, so
  original PDFs/downloads reach the authenticated API. Sidebar's hook now matches
  its 1024-pixel CSS breakpoint, restoring tablet navigation.

## Verification ledger

Fresh command logs are under `.tmp/deployment-qa/`. Results below will be updated
after checks complete; historical counts elsewhere are not evidence for this pass.

- FinanceOS + BudgetHealthCard: 29 tests passed after fixing the dialog's old
  open handler, which incorrectly preselected an empty list before history loaded.
- Scenarios: 36 tests passed. Two newly added assertions were corrected after
  reviewing the rendered metric and independently checking the 24-month burn:
  (2,000 expenses − 800 stressed income) × 24 = 28,800; subtracting 9,000 saved
  reserves leaves 19,800. No application arithmetic was changed to fit those tests.
- Budget health API: 10 tests passed, including absent peers and zero/missing APR.
- Final full client: **511/511 in 59 files**; final lint/build pass. Latest entry:
  `index-b-py_WyV.js`.
- Full server: **363/364 in 84 files**. One new parser test exposed a format flag
  leaking `brief` into the title. Fixed sanitization order; **22/22 chat/title
  checks pass afterward**, followed by a passing server type check/API/worker
  build. The entire server suite was not repeated after that narrow repair.
- Final full AI tests/evaluations: **470/470**; targeted Ruff passes. One existing
  Pandas mixed-timezone FutureWarning remains in `tools/data_processors.py`.
- Both production-dependency audits report zero vulnerabilities.
- Final local API smoke: **33/33**, including scenario calculation and PDF creation.
- Generated PDF: HTTP 200, PDF type/signature, attachment header, 2,872 bytes.
  Actual inbuilt-browser download matches the authenticated API bytes by SHA-256.
- Browser: populated/empty workspace switching; recorded USD 4.32 cap saved and
  totals refreshed; no-history Apply disabled; peer/rebalance empty actions;
  no fake zero-expense runway; PDF creation, quoted amount, page 1, source link,
  return-to-chat, original PDF viewer and actual download verified.
- Exact PDF expense question: seven agent steps before repair; afterward only
  `document_lookup`, **3 ms agent latency and zero LLM calls**. This local trace
  is not a provider throughput benchmark.
- Responsive: 320/390 phone layouts in light/dark themes; 768 tablet menu opens;
  1440 desktop sidebar visible/mobile bar hidden. Measured document scroll width
  did not exceed the tested width. Temporary viewport/cache overrides cleared.
- Final source walk: 12 observed responses, no HTTP failures/truncation. Fresh
  browser warning/error log empty. Verified chat left open.

Details: `BUTTON_COVERAGE_20261108.md`. Fresh logs under `.tmp/deployment-qa/`:
`client-full-final-20261108.log`, `server-full-20261108.log`,
`chat-title-final-20261108.log`, `ai-full-final-20261108.log`,
`client-build-tablet-20261108.log`, `server-build-verified-20261108.log`,
`api-smoke-final-20261108.log`.

## Prioritized remaining findings

These are open source findings, not a claim that every path has been exercised.
They prevent a blanket “all mock data removed” or “production ready” claim.

| Priority | Finding and source | Required verification |
| --- | --- | --- |
| P0 | `billingController.ts` creates a fictitious paid invoice on an empty invoice GET; credit-pack purchase grants credits without a processor payment event. `billing.ts` stub checkout activates paid plans. | Empty invoice GET must be read-only; entitlements/receipts require a verified payment event; test Stripe and unavailable-provider states. |
| P0 | `financial_educator.py` caches a personalized answer by concept before reading the requesting profile. | Separate users/requests/profile context or remove unsafe shared cache; test two users asking the same concept. |
| P0 | Canary recent-event history retains financial numeric tokens and arithmetic details in shared state exposed by status routes. | Redact/aggregate tenant-specific details and authorize operator telemetry; isolation tests. No evidence here establishes raw full-prompt retention. |
| P0 review | Earlier market audit identified a 2FA login/OAuth bypass. Incoming authentication changes require a new complete OTP-enforcement review. | Password and OAuth login must require the configured second factor before issuing a full session. |
| P1 | `GoalsAndDebts.tsx` dynamic savings simulation still substitutes income/expenses, goal, transaction count, windfall and payment assumptions, including persisted task text. | Use saved values or explicit user-entered assumptions; preserve unknown/zero and test no-goal/no-history paths. |
| P1 | `FinancialTransformationChart.tsx` fabricates intermediate net-worth points with randomness. | Use actual dated snapshots, or render only known endpoints without claiming a measured history. |
| P1 | `aiCanaryService.ts` returns a hardcoded 4/4, 100%, 1.5 ms success when AI Core fails. | Unavailable dependency must not produce a passing result; test the failure branch. |
| P1 | `commandCenterService.ts` sums nominal balances across currencies and drops negative cash balances. | Group currencies or use evidenced conversion; preserve overdrafts and test mixed currencies. |
| P2 | Budget-health reads catch database failures as zero/empty. Capacity labels are static estimates; retrieval RRF ranks become absolute “100/100” relevance. | Separate failure/empty states; label estimates and relative ranks honestly. |
| P2 | A calendar missing-date fallback still uses day 15. Forecast reporting uses fixed FX constants. | Require a date or mark it unknown; disclose FX provenance and avoid treating fixed rates as live quotes. |
| P2 | The existing installed QA worker kept an older client shell. | Clean localhost installation passes repaired PDF navigation. Verify upgrade from old installed workers separately; no cache/user data was deleted to force a pass. |
| P2 | Direct document answers display broader available-context coverage; dashboard fallback can expose technical AI Core errors. | Separate evidence used from context available; sanitize dependency errors. |
| P2 | Chat PDF creation uses saved-record templates or explicit `Content:`; arbitrary requested sections are not guaranteed. | Explain template scope or add validated section controls before claiming unrestricted authorship. |

## Deployment limits

Local synthetic QA records are allowed as test fixtures; they must never be seeded
as a production user's financial history. No user records are deleted by this batch.
No real payments, bank actions, OAuth callbacks, SMTP delivery or cloud delivery are
authorized as completed tests. Container/production runtime and provider access
must be verified separately. A previous automatic approval review rejected
production `npm start` as “blocked by policy”; it is not retried or bypassed.
