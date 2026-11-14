# FinWise product goal

Help a person answer three practical questions: **Where did my money go? What needs my attention? What should I do next?**

The weekly loop follows `IMPROVEMENT_PLAN.txt`: capture real records, understand them, review uncertainty, act, and check progress. Prefer a reliable small action over another dashboard or unverified AI claim.

## A useful first session

1. Add transactions or upload a statement. Show original amounts and an import preview before changing the ledger.
2. Review uncertain records. Approval must survive reloads; changes to amount, date, category, merchant or splits require a fresh review.
3. Ask about saved activity or a document. Quote supported amounts and currency, explain missing context, and open the actual source page.
4. Turn a decision into a task. Keep drafts after failure, accept cents, avoid duplicate effects on retry, and show the saved completion state.
5. Export a usable record. Preserve signed original amounts, provide an accessible download, and distinguish queued, failed and completed jobs.

## Acceptance criteria

| User outcome | Required behavior | Evidence boundary |
| --- | --- | --- |
| Trust the ledger | Changing display currency never changes the original amount on edit, split or recurring-rule creation | Browser QA and transaction regressions |
| Finish a review once | Single and bulk approvals persist; materially changed records reopen; another user's records remain inaccessible | API regressions and reload check |
| Understand a document | Source action opens the correct owned file and physical page; unsupported claims are not invented | Synthetic document chat and source-navigation QA |
| Follow through | Completion updates detail and list views; effect drafts survive profile refresh; retries reuse their request key | Task browser QA and regressions |
| Keep a copy | CSV retains cents and signs; PDF is readable; failed jobs do not stop later work | Local exports and isolated worker evidence |
| Use a phone | Navigation, forms, dialogs and composer fit a 390px viewport; chat remains usable at 320px | Inbuilt-browser observations; broader accessibility testing remains open |

## Measures to collect in staging

Measure time from first import to first approved record, time to a useful cited answer, review items resolved without reappearing, tasks completed, export success rate, and per-request model calls/latency. These are proposed measures, not collected adoption or business results. Keep telemetry scoped and exclude document content and credentials.

## Release boundary

Local deterministic document answers and calculations demonstrate value without unnecessary model calls. Provider-generated advice, live bank connections, payments, email delivery and public hosting require separately verified accounts and staging checks. A model catalog entry does not prove a provider integration. See `PRODUCT_CAPABILITY_STATUS.md`, `BROWSER_TEST_RESULTS.md` and `KNOWN_ISSUES_AND_DRIFT.md` for tested capabilities and remaining work.
