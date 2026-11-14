---
title: "Inbuilt-browser coverage — 8 November 2026"
description: "Browser testing and UI button coverage results for FinWise FinanceOS controls"
quadrant: record
audience: [developer, operator]
owner: "@qa-team"
status: reviewed
last_reviewed: 2026-11-08
review_every_days: 90
---

# Inbuilt-browser coverage — 8 November 2026

This pass used only the ChatGPT inbuilt browser. Existing synthetic QA records
were kept in local `finwise-browser-test` on port 27019. Preview :5181 and dev API
:3000 were used; the separate project on :5180 was left alone.

| Area | Controls and observed result |
| --- | --- |
| Sign-in/context | Existing QA sign-in; switch personal/empty team workspaces; data refreshes to selected scope. |
| Smart budgets | Open/Cancel; buffer controls; Deselect All; keyboard Space selects Mobile QA; change buffer retains selection; Apply saves USD 4.32; pending controls disabled; toast/totals update. Empty workspace offers manual setup and disables Apply. EUR provenance/cents/history retry also have automated coverage. |
| Budget health | Peer panel reports unavailable without fake statistics. Empty Peer Benchmarks, Auto-Rebalance and View your budget controls show appropriate panels. Debt card uses saved APR and labelled interest estimate; savings not calculated. |
| Scenarios | Zero expenses show unavailable runway, no resilience score and disabled scheduling; no 99.9-month fallback. Presets labelled assumptions; account simulation describes saved balances. Scenario controls/arithmetic: 36 automated checks. |
| Chat creation | New session; send PDF request; correct quoted title; saved document card; zero-model-call renderer trace; reload/return preserve messages. |
| Document question | Ask about this PDF attaches it; editable question sends; exact USD 3000.00 passage on physical page 1; one document_lookup step, 3 ms, zero model calls. |
| Sources/files | Sources expand; exact page link opens correct processed file/page 1 of 1; previous/next correctly disabled; Back to chat restores exact session; Open in Files works. |
| Original/download | Before: false app 404 and timed-out download event. After Workbox API denylist repair, a clean localhost installation opens an actual PDF viewer and saves the PDF through Download PDF. Browser download matches authenticated API bytes by SHA-256. |
| Responsive/themes | 320/390 phone in light/dark, no measured horizontal overflow; 768 tablet menu opens after breakpoint repair; 1440 desktop sidebar visible/mobile bar hidden. Overrides reset. |
| AI status | Overview loads configured Gemini metadata and health. This is not proof of provider entitlement/inference; document flows used zero model calls. |

Final source walk: 12 observed network responses, no HTTP failures/truncation.
Fresh warning/error log empty. Proof under `output/browser/`:

- `mobile-empty-budget-20261108.jpg`
- `mobile-recorded-budget-20261108.jpg`
- `mobile-document-lookup-20261108.jpg`
- `mobile-pdf-source-20261108.jpg`
- `narrow-chat-320-dark-20261108.jpg`
- `tablet-navigation-768-20261108.jpg`
- `original-pdf-routing-fixed-20261108.jpg`

Excluded from this browser pass: destructive deletion, permission/key creation,
real payments, OAuth/email/bank callbacks, cloud delivery, every workflow/editor
combination, live provider failover, production startup and containers. Automated
coverage must not be described as a real external/browser transaction.

Installed-worker upgrades remain open: old 127.0.0.1 worker kept an earlier shell;
clean localhost used the new bundle. No browser cache or user data was cleared.
