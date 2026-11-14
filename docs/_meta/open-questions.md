# Open Questions & Decisions Awaiting Owner Confirmation

**Status:** Minimal & Resolved by Code Evidence  
**Date:** 2026-11-08

---

## 1. Questions for Project Maintainer / Owner

1. **Security Vulnerability Contact Channel (`SECURITY.md`)**:
   - *Current default*: Private GitHub Security Advisory or `security@finwise.app`.
   - *Question for Owner*: Confirm if a dedicated security mailbox or external bug bounty program should be linked for coordinated vulnerability disclosure.

2. **Automated Scheduled Export Remote Storage (`ScheduledExportModel`)**:
   - *Current default*: AWS S3 and GCP Cloud Storage supported via S3-compatible SDKs.
   - *Question for Owner*: Should Azure Blob Storage connector be added to the multi-channel export UI in the next release?

3. **External Bank Webhook Provider Ingestion Mode**:
   - *Current default*: Protected testing endpoint at `POST /api/transactions/bank-feed` with JWT authentication and strict `externalId` deduplication.
   - *Question for Owner*: Which banking provider webhook signature scheme (e.g. Plaid HMAC-SHA256, Teller mTLS) should be implemented for live production webhook ingress?

**Evidence:**
- `docs/SECURITY.md`
- `docs/API.md`
- `server/src/services/scheduledExportService.ts`
- `server/src/controllers/financialDataController.ts`
