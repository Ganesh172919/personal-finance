import re

with open("docs/IMPROVEMENT_PROGRESS.md", "r", encoding="utf-8") as f:
    content = f.read()

batch_text = """11. **Batch 11 — Receipt OCR Scanning, Field Validation, Confidence Badges & Review Sheet Triage:**
    - *Frontend*: In `client/src/components/ReceiptOcrDialog.tsx`:
      - Replaced raw inputs with design system `Input` and `Label`.
      - Added color-coded confidence score badges (`ConfidenceBadge`: green >=70%, amber 40-70%, red <40%) with `data-testid={`badge-confidence-${field}`}`.
      - Instrumented complete data test IDs: `btn-scan-receipt`, `dialog-receipt-ocr`, `input-receipt-file`, `ocr-loading-card`, `ocr-warnings-card`, `ocr-review-form`, `input-ocr-vendor`, `input-ocr-date`, `input-ocr-total`, `input-ocr-tax`, `input-ocr-category`, `input-ocr-currency`, `input-ocr-description`, `btn-toggle-ocr-items`, `ocr-items-table`, `ocr-item-row-${idx}`, `btn-cancel-ocr`, `btn-confirm-ocr`.
    - *Frontend*: In `client/src/pages/Receipts.tsx`:
      - Added color-coded status badges for receipts (`parsed` in amber, `confirmed` in emerald).
      - Added full data test ID matrix: `tab-receipts-all`, `tab-receipts-parsed`, `tab-receipts-confirmed`, `receipts-list-card`, `receipt-item-${r.id}`, `badge-status-${r.id}`, `btn-prev-receipts-page`, `btn-next-receipts-page`, `receipts-page-indicator`, `receipt-detail-sheet`, `sheet-status-badge`, `notice-already-confirmed`, `input-sheet-vendor`, `input-sheet-date`, `input-sheet-total`, `input-sheet-tax`, `input-sheet-currency`, `input-sheet-category`, `input-sheet-description`, `btn-delete-receipt`, `btn-confirm-receipt`.
    - *Test Pinning*: In `client/src/pages/FinancialCalendar.test.tsx`, pinned Vitest system time using fake timers (`vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));`) to eliminate month-rollover boundary flakiness.
    - *AI Core Vectorization*: In `server/AI_Core/agents/income_expense_analyzer.py` and `server/AI_Core/tools/data_processors.py`, optimized spending trends aggregation and anomaly detection: replaced row-by-row `.loc[]` iteration with `grouped.to_dict(orient="index")`, replaced `pd.DataFrame(transactions)` in `detect_anomalies` with single-pass sample mean and standard deviation, and replaced `pd.DataFrame.iterrows()` in `_serialize_dict` with `to_dict(orient="records")`, cutting evaluation latency and passing all 175 benchmarks.
    - *Frontend Tests*:
      - Added `client/src/components/ReceiptOcrDialog.test.tsx` (6/6 passed): Flag gating, scan dialog open, file input, OCR extraction with confidence badges, line items toggle, and confirm mutation.
      - Expanded `client/src/pages/Receipts.test.tsx` to 6 unit tests (6/6 passed): Filtering by status, detail sheet confirmation, deletion of parsed receipts, and disabled delete with already-confirmed notice.

12. **Batch 12 — Subscription Billing Quota Threshold Alerts, On-Demand Credit Pack Boosters & Credit Grant Execution:**
    - *Backend*: In `server/src/schemas/v1/billingSchemas.ts`:
      - Added `purchaseCreditsBodySchema` validating `pack_id` enum (`"ai_pack_250"`, `"ocr_pack_100"`, `"scenarios_pack_100"`, `"flex_bundle"`).
    - *Backend*: In `server/src/controllers/v1/billingController.ts`:
      - Implemented `CREDIT_PACK_DEFINITIONS` catalog: AI Power Pack (+250 AI calls for $5), OCR Document Pack (+100 OCR scans for $4), Simulation Pack (+100 simulations for $3), and All-in-One Flex Bundle (+500 AI, +200 OCR, +200 simulations for $10).
      - Added `purchaseCreditPack` endpoint handler: validates organization admin role, executes `grantCredits` into `CreditGrantModel`, invalidates Redis entitlement cache, records non-blocking audit event (`billing_credit_pack_purchased`), and returns boosted credit summary.
    - *Backend*: In `server/src/routes/v1Routes.ts`:
      - Registered route `POST /billing/credits` with JWT authentication and body validation.
      - Synchronized OpenAPI path definitions via `generateOpenApiPaths.ts` (180 registered routes; 100% route coverage verified in `openapiRoutesCoverage.test.ts`).
    - *Backend Tests*:
      - Added test in `server/src/test/monetization.test.ts` verifying credit pack purchase, Redis cache eviction, limit increase verification, and rejection of unknown pack IDs.
    - *Frontend*: In `client/src/types/apiTypes.ts` & `client/src/lib/api/billing.ts`:
      - Exported `PurchaseCreditsRequest`, `PurchaseCreditsResponse`, and `purchaseCreditPack` API helper.
    - *Frontend*: In `client/src/pages/Billing.tsx`:
      - Built proactive **Quota Threshold Warning Alert** (`data-testid="alert-quota-warning"`): triggers dynamically when any quota metric is >=80% (amber warning) or >=100% (destructive alert), highlighting affected features with guidance.
      - Added quota status badges (`Exhausted` in rose, `80%+ Used` in amber) on entitlement meters.
      - Built **On-Demand Credit Packs** catalog section (`data-testid="card-credit-packs"`) rendering 4 booster cards with tags, descriptions, highlights, and purchase buttons (`button-buy-${pack.id}`).
      - Built **Credit Pack Purchase Confirmation Dialog** (`data-testid="dialog-credit-pack-confirm"`) with price breakdown, booster summary, cancel action (`button-cancel-credit-pack`), and confirm activation button (`button-confirm-credit-purchase`).
      - Hooked up `creditsMutation` invalidating `["/api/config/me"]` with instant feedback toast.
    - *Frontend Tests*:
      - Expanded `client/src/pages/Billing.test.tsx` from 5 to 8 tests (8/8 passed) verifying quota threshold warning display, credit packs catalog rendering, confirmation dialog flow, and mutation dispatch with toast notification.
"""

target = "**Full Verification Snapshot:**"
if target in content:
    content = content.replace(target, batch_text + "\n" + target)
    content = content.replace("48 files passed / 315 tests passed", "49 files passed / 326 tests passed")
    content = content.replace("51 files passed / 197 tests passed", "51 files passed / 198 tests passed")
    content = content.replace("48 Client Suites (315 tests) • 51 Server Suites (197 tests)", "49 Client Suites (326 tests) • 51 Server Suites (198 tests)")
    with open("docs/IMPROVEMENT_PROGRESS.md", "w", encoding="utf-8") as f:
        f.write(content)
    print("SUCCESS: Updated docs/IMPROVEMENT_PROGRESS.md")
else:
    print("ERROR: Target not found")
