# Client Test Inventory

Static source index, generated from the release worktree on 23 November 2026. Declarations are not test results.

## `client/src/app/providers/ScopedDataProvider.test.tsx`

- Line 35: `it("replaces cached finances, drafts and transient history when the account changes", async () => {`
  - Source: `client/src/app/providers/ScopedDataProvider.test.tsx:35`

- Line 53: `it("retires workspace queries and ignores late replies from a previous workspace", async () => {`
  - Source: `client/src/app/providers/ScopedDataProvider.test.tsx:53`

- Line 66: `it("clears private cached data when signing out", async () => {`
  - Source: `client/src/app/providers/ScopedDataProvider.test.tsx:66`

- Line 76: `it("preserves the saved session for the same authenticated owner during boot", async () => {`
  - Source: `client/src/app/providers/ScopedDataProvider.test.tsx:76`

- Line 88: `it("loads private queries under React StrictMode", async () => {`
  - Source: `client/src/app/providers/ScopedDataProvider.test.tsx:88`

## `client/src/components/AiStatusDialog.test.tsx`

- Line 97: `describe("AiStatusDialog Component - Continuous Canary & Invariant Validation", () => {`
  - Source: `client/src/components/AiStatusDialog.test.tsx:97`

- Line 145: `it("renders the trigger button and opens dialog with Canary tab available", async () => {`
  - Source: `client/src/components/AiStatusDialog.test.tsx:145`

- Line 158: `it("switches to Canary tab and renders the real-time invariant health metrics", async () => {`
  - Source: `client/src/components/AiStatusDialog.test.tsx:158`

- Line 189: `it("runs the synthetic canary probe suite on click and displays the execution report", async () => {`
  - Source: `client/src/components/AiStatusDialog.test.tsx:189`

## `client/src/components/BudgetHealthCard.test.tsx`

- Line 245: `describe("BudgetHealthCard Component", () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:245`

- Line 283: `it("renders 82 health score gauge and 4 pillar score breakdowns", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:283`

- Line 309: `it("renders spending trend projection and daily week-over-week averages", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:309`

- Line 323: `it("renders category burn rate alerts", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:323`

- Line 339: `it("renders clean empty state when data is not yet available", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:339`

- Line 363: `it("renders predictive spending limits section with safe daily allowances and dynamic recommended caps", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:363`

- Line 390: `it("displays category overshoot warning and daily reduction required callout", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:390`

- Line 410: `it("correctly handles exhausted envelopes with 0 safe daily spend and critical status", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:410`

- Line 452: `it("renders proactive savings recommendations and potential savings summary badges", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:452`

- Line 478: `it("allows user to 1-click schedule an action task from a proactive recommendation", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:478`

- Line 513: `it("renders peer spending benchmarks tab with statistical cohort alignment and category insights", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:513`

- Line 551: `it("shows an unavailable peer comparison state without inventing cohort statistics", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:551`

- Line 576: `it("keeps peer and rebalance controls useful when no financial records exist", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:576`

- Line 593: `it("does not display a fallback cohort or alignment when peer metadata is missing", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:593`

- Line 607: `it("honors explicit peer unavailability even if an old payload contains benchmark rows", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:607`

- Line 623: `it("keeps unknown debt savings and score impact out of badges and task promises", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:623`

- Line 657: `it("renders auto-rebalancing cockpit and executes 1-click envelope rebalance with budget preservation", async () => {`
  - Source: `client/src/components/BudgetHealthCard.test.tsx:657`

## `client/src/components/CommandCenter.test.tsx`

- Line 118: `describe("CommandCenter Component", () => {`
  - Source: `client/src/components/CommandCenter.test.tsx:118`

- Line 146: `it("renders morning greeting and all 4 core KPI cards", async () => {`
  - Source: `client/src/components/CommandCenter.test.tsx:146`

- Line 180: `it("renders priority signals detail list and action links", async () => {`
  - Source: `client/src/components/CommandCenter.test.tsx:180`

- Line 199: `it("renders upcoming bills within next 7 days", async () => {`
  - Source: `client/src/components/CommandCenter.test.tsx:199`

- Line 213: `it("renders error card with retry button when query fails", async () => {`
  - Source: `client/src/components/CommandCenter.test.tsx:213`

- Line 233: `it("shows all clear badge when no tasks are overdue or due soon", async () => {`
  - Source: `client/src/components/CommandCenter.test.tsx:233`

- Line 248: `it("renders multi-account consolidated netting cockpit strip and net cash indicators", async () => {`
  - Source: `client/src/components/CommandCenter.test.tsx:248`

- Line 275: `it("renders deficit warning banner when credit liabilities exceed liquid cash", async () => {`
  - Source: `client/src/components/CommandCenter.test.tsx:275`

- Line 308: `it("gracefully falls back when consolidated_netting is missing from legacy payload", async () => {`
  - Source: `client/src/components/CommandCenter.test.tsx:308`

## `client/src/components/CommandPalette.test.tsx`

- Line 32: `describe("CommandPalette", () => {`
  - Source: `client/src/components/CommandPalette.test.tsx:32`

- Line 39: `it("opens on Ctrl+K and navigates to the selected page", () => {`
  - Source: `client/src/components/CommandPalette.test.tsx:39`

- Line 56: `it("filters pages by the typed query and offers asking the AI", () => {`
  - Source: `client/src/components/CommandPalette.test.tsx:56`

## `client/src/components/ConversationInsightsPanel.test.tsx`

- Line 22: `it("marks a reused summary and explicitly bypasses cache on Refresh", async () => {`
  - Source: `client/src/components/ConversationInsightsPanel.test.tsx:22`

- Line 33: `it("retains the previous summary when explicit refresh fails", async () => {`
  - Source: `client/src/components/ConversationInsightsPanel.test.tsx:33`

- Line 43: `it("explains a basic recap without exposing its internal agent name", async () => {`
  - Source: `client/src/components/ConversationInsightsPanel.test.tsx:43`

- Line 51: `it("keeps a late refresh response out of another workspace", async () => {`
  - Source: `client/src/components/ConversationInsightsPanel.test.tsx:51`

- Line 68: `it("explains a quota failure and keeps the previous summary available", async () => {`
  - Source: `client/src/components/ConversationInsightsPanel.test.tsx:68`

- Line 79: `it("does not reuse the previous user's query state", async () => {`
  - Source: `client/src/components/ConversationInsightsPanel.test.tsx:79`

- Line 89: `it("keeps the full plan optional and avoids a second primary heading", async () => {`
  - Source: `client/src/components/ConversationInsightsPanel.test.tsx:89`

- Line 98: `it("rechecks context on mount even when a previous summary was just cached", async () => {`
  - Source: `client/src/components/ConversationInsightsPanel.test.tsx:98`

## `client/src/components/Dashboard.test.tsx`

- Line 45: `describe("Skeleton component", () => {`
  - Source: `client/src/components/Dashboard.test.tsx:45`

- Line 46: `it("renders with default classes", () => {`
  - Source: `client/src/components/Dashboard.test.tsx:46`

- Line 54: `it("accepts custom className", () => {`
  - Source: `client/src/components/Dashboard.test.tsx:54`

- Line 62: `describe("Dashboard smoke test", () => {`
  - Source: `client/src/components/Dashboard.test.tsx:62`

- Line 63: `it("renders authenticated user name after loading", async () => {`
  - Source: `client/src/components/Dashboard.test.tsx:63`

## `client/src/components/ExtractedFileText.test.tsx`

- Line 7: `it("navigates physical PDF pages without skipping a blank middle page", () => {`
  - Source: `client/src/components/ExtractedFileText.test.tsx:7`

- Line 23: `it("retains leading and trailing blank pages", () => {`
  - Source: `client/src/components/ExtractedFileText.test.tsx:23`

- Line 33: `it("explains that later PDF pages are missing after bounded extraction", () => {`
  - Source: `client/src/components/ExtractedFileText.test.tsx:33`

- Line 39: `it("keeps legacy flattened files and plain notes readable without invented page numbers", () => {`
  - Source: `client/src/components/ExtractedFileText.test.tsx:39`

- Line 45: `it("does not substitute a different page when a citation points past the extracted text", () => {`
  - Source: `client/src/components/ExtractedFileText.test.tsx:45`

## `client/src/components/FinancialCopilot.test.tsx`

- Line 24: `it("restores only the current user's workspace history and ignores the legacy shared cache", () => {`
  - Source: `client/src/components/FinancialCopilot.test.tsx:24`

- Line 36: `it("hides old organization context immediately and restores only the new scope after confirmation", () => {`
  - Source: `client/src/components/FinancialCopilot.test.tsx:36`

- Line 47: `it("keeps the direct answer visible and the full financial plan behind a disclosure", async () => {`
  - Source: `client/src/components/FinancialCopilot.test.tsx:47`

- Line 60: `it("does not surface a late response after changing the signed-in user", async () => {`
  - Source: `client/src/components/FinancialCopilot.test.tsx:60`

## `client/src/components/FinancialVitals.test.tsx`

- Line 24: `describe("financial summary availability", () => {`
  - Source: `client/src/components/FinancialVitals.test.tsx:24`

- Line 25: `it("does not assess an empty workspace as balanced or below a savings target", async () => {`
  - Source: `client/src/components/FinancialVitals.test.tsx:25`

- Line 37: `it("shows known negative cash flow while asking for income before computing a rate", async () => {`
  - Source: `client/src/components/FinancialVitals.test.tsx:37`

- Line 46: `it("shows a loading state instead of invented zero balances while waiting", () => {`
  - Source: `client/src/components/FinancialVitals.test.tsx:46`

- Line 54: `it("lets a failed request recover and labels the exact savings target correctly", async () => {`
  - Source: `client/src/components/FinancialVitals.test.tsx:54`

- Line 65: `it("identifies cached figures when a background refresh fails", async () => {`
  - Source: `client/src/components/FinancialVitals.test.tsx:65`

## `client/src/components/GoalProgress.test.tsx`

- Line 46: `it("renders empty state with link to /goals-debts when no goals exist", () => {`
  - Source: `client/src/components/GoalProgress.test.tsx:46`

- Line 54: `it("renders goals with pacing and status badges", () => {`
  - Source: `client/src/components/GoalProgress.test.tsx:54`

- Line 90: `it("detects goal milestone drift and schedules catch-up task when clicked", async () => {`
  - Source: `client/src/components/GoalProgress.test.tsx:90`

- Line 123: `it("detects overdue goal drift and schedules timeline adjustment task", async () => {`
  - Source: `client/src/components/GoalProgress.test.tsx:123`

## `client/src/components/InvestmentPortfolio.test.tsx`

- Line 57: `it("renders loading skeleton while query is in flight", () => {`
  - Source: `client/src/components/InvestmentPortfolio.test.tsx:57`

- Line 62: `it("renders portfolio summary, allocations, holdings, and manage link", async () => {`
  - Source: `client/src/components/InvestmentPortfolio.test.tsx:62`

- Line 107: `it("renders clean fallback text when allocations and holdings are empty", async () => {`
  - Source: `client/src/components/InvestmentPortfolio.test.tsx:107`

## `client/src/components/NewsletterSettings.test.tsx`

- Line 58: `describe("NewsletterSettings Component", () => {`
  - Source: `client/src/components/NewsletterSettings.test.tsx:58`

- Line 92: `it("renders newsletter preferences with subscription state, schedule, and content sections", async () => {`
  - Source: `client/src/components/NewsletterSettings.test.tsx:92`

- Line 112: `it("modifies delivery time and saves preferences via update mutation", async () => {`
  - Source: `client/src/components/NewsletterSettings.test.tsx:112`

- Line 143: `it("generates preview and renders interactive in-app preview card with desktop/mobile view modes", async () => {`
  - Source: `client/src/components/NewsletterSettings.test.tsx:143`

- Line 181: `it("triggers immediate newsletter send via Send Now button", async () => {`
  - Source: `client/src/components/NewsletterSettings.test.tsx:181`

## `client/src/components/OfflineBanner.test.tsx`

- Line 7: `describe("OfflineBanner", () => {`
  - Source: `client/src/components/OfflineBanner.test.tsx:7`

- Line 28: `it("does not render when online initially", () => {`
  - Source: `client/src/components/OfflineBanner.test.tsx:28`

- Line 33: `it("displays offline warning banner when network connection is lost", () => {`
  - Source: `client/src/components/OfflineBanner.test.tsx:33`

- Line 45: `it("displays reconnected alert and triggers query invalidation when coming back online", () => {`
  - Source: `client/src/components/OfflineBanner.test.tsx:45`

## `client/src/components/ReceiptOcrDialog.test.tsx`

- Line 63: `describe("ReceiptOcrDialog Component", () => {`
  - Source: `client/src/components/ReceiptOcrDialog.test.tsx:63`

- Line 91: `it("renders Scan Receipt button and disables it when feature flag is off", () => {`
  - Source: `client/src/components/ReceiptOcrDialog.test.tsx:91`

- Line 100: `it("opens dialog on click and displays file upload input", async () => {`
  - Source: `client/src/components/ReceiptOcrDialog.test.tsx:100`

- Line 112: `it("handles receipt file upload, calls parseReceipt, and displays extracted fields with confidence badges", async () => {`
  - Source: `client/src/components/ReceiptOcrDialog.test.tsx:112`

- Line 161: `it("toggles line items table and displays item details with confidence badges", async () => {`
  - Source: `client/src/components/ReceiptOcrDialog.test.tsx:161`

- Line 187: `it("validates form fields and disables confirm button when required fields are missing", async () => {`
  - Source: `client/src/components/ReceiptOcrDialog.test.tsx:187`

- Line 209: `it("submits confirmReceipt mutation and calls onConfirmed callback", async () => {`
  - Source: `client/src/components/ReceiptOcrDialog.test.tsx:209`

## `client/src/components/SourceEvidenceList.test.tsx`

- Line 10: `it("prioritizes a cited passage and makes every source available", () => {`
  - Source: `client/src/components/SourceEvidenceList.test.tsx:10`

- Line 27: `it("keeps non-file and malformed references as plain evidence", () => {`
  - Source: `client/src/components/SourceEvidenceList.test.tsx:27`

- Line 37: `it("opens legacy file references without guessing a page from their label", () => {`
  - Source: `client/src/components/SourceEvidenceList.test.tsx:37`

- Line 42: `it("rejects malformed page query parameters", () => {`
  - Source: `client/src/components/SourceEvidenceList.test.tsx:42`

- Line 49: `it("carries a safe conversation return path in source links", () => {`
  - Source: `client/src/components/SourceEvidenceList.test.tsx:49`

- Line 60: `it("rejects external and unrelated return destinations", () => {`
  - Source: `client/src/components/SourceEvidenceList.test.tsx:60`

## `client/src/components/TaskApplyDialog.test.tsx`

- Line 28: `it("exposes named effect fields and accepts cent precision", async () => {`
  - Source: `client/src/components/TaskApplyDialog.test.tsx:28`

- Line 40: `it("preserves draft effects and the retry key when profile data refreshes", async () => {`
  - Source: `client/src/components/TaskApplyDialog.test.tsx:40`

## `client/src/components/ThemeProvider.test.tsx`

- Line 19: `it("applies and switches the theme if the browser blocks storage", () => {`
  - Source: `client/src/components/ThemeProvider.test.tsx:19`

## `client/src/components/TransactionReviewQueue.test.tsx`

- Line 110: `describe("TransactionReviewQueue Component", () => {`
  - Source: `client/src/components/TransactionReviewQueue.test.tsx:110`

- Line 156: `it("renders pending review transactions with confidence badges, amounts, and flags", async () => {`
  - Source: `client/src/components/TransactionReviewQueue.test.tsx:156`

- Line 190: `it("filters review queue when clicking filter chips", async () => {`
  - Source: `client/src/components/TransactionReviewQueue.test.tsx:190`

- Line 221: `it("approves single transaction and slides it out of the queue", async () => {`
  - Source: `client/src/components/TransactionReviewQueue.test.tsx:221`

- Line 247: `it("creates an automated category rule via 'Always ↻'", async () => {`
  - Source: `client/src/components/TransactionReviewQueue.test.tsx:247`

- Line 269: `it("supports multi-select, select-all, and bulk approve", async () => {`
  - Source: `client/src/components/TransactionReviewQueue.test.tsx:269`

- Line 305: `it("renders empty state celebration graphic when no transactions need review", async () => {`
  - Source: `client/src/components/TransactionReviewQueue.test.tsx:305`

- Line 325: `it("renders ML cluster suggestion banner and switches to Smart Merchant Clusters view", async () => {`
  - Source: `client/src/components/TransactionReviewQueue.test.tsx:325`

- Line 357: `it("applies merchant cluster normalization and invalidates queries", async () => {`
  - Source: `client/src/components/TransactionReviewQueue.test.tsx:357`

- Line 388: `it("displays empty state when all merchant clusters are normalized", async () => {`
  - Source: `client/src/components/TransactionReviewQueue.test.tsx:388`

## `client/src/features/chat/ChatContainer.test.tsx`

- Line 32: `describe("Starter suggestions", () => {`
  - Source: `client/src/features/chat/ChatContainer.test.tsx:32`

- Line 33: `it("sends in the freshly created empty session instead of abandoning it", async () => {`
  - Source: `client/src/features/chat/ChatContainer.test.tsx:33`

- Line 42: `describe("Chat links from Files", () => {`
  - Source: `client/src/features/chat/ChatContainer.test.tsx:42`

- Line 43: `it("loads the saved attachment and prefills a question without automatically sending it", async () => {`
  - Source: `client/src/features/chat/ChatContainer.test.tsx:43`

- Line 53: `it("keeps a removed attachment removed when a session is created", async () => {`
  - Source: `client/src/features/chat/ChatContainer.test.tsx:53`

- Line 62: `it("displays an attachment failure and retries without sending a question", async () => {`
  - Source: `client/src/features/chat/ChatContainer.test.tsx:62`

- Line 71: `it("rejects invalid file links without making a request", async () => {`
  - Source: `client/src/features/chat/ChatContainer.test.tsx:71`

## `client/src/features/chat/ChatDocumentCard.test.tsx`

- Line 11: `describe("created document card", () => {`
  - Source: `client/src/features/chat/ChatDocumentCard.test.tsx:11`

- Line 12: `it("links downloads through the authenticated route and returns file review to its chat", () => {`
  - Source: `client/src/features/chat/ChatDocumentCard.test.tsx:12`

- Line 18: `it("fetches the generated file through the authenticated download helper", async () => {`
  - Source: `client/src/features/chat/ChatDocumentCard.test.tsx:18`

- Line 28: `it("does not render malformed file references from persisted metadata", () => {`
  - Source: `client/src/features/chat/ChatDocumentCard.test.tsx:28`

- Line 32: `it("selects the saved document for a follow-up question without downloading it", () => {`
  - Source: `client/src/features/chat/ChatDocumentCard.test.tsx:32`

- Line 38: `it("does not change selected context while a message is sending", () => {`
  - Source: `client/src/features/chat/ChatDocumentCard.test.tsx:38`

- Line 42: `it("renders format badge and page count badge when provided", () => {`
  - Source: `client/src/features/chat/ChatDocumentCard.test.tsx:42`

## `client/src/features/chat/ChatHistorySidebar.test.tsx`

- Line 32: `describe("ChatHistorySidebar delete", () => {`
  - Source: `client/src/features/chat/ChatHistorySidebar.test.tsx:32`

- Line 33: `it("leaves the deleted conversation's URL when the open thread is deleted", async () => {`
  - Source: `client/src/features/chat/ChatHistorySidebar.test.tsx:33`

- Line 41: `it("keeps the current URL when a different thread is deleted", async () => {`
  - Source: `client/src/features/chat/ChatHistorySidebar.test.tsx:41`

## `client/src/features/chat/ChatInput.test.tsx`

- Line 24: `describe("chat composer recovery", () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:24`

- Line 25: `it("keeps the search mode selected when the draft is replaced", async () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:25`

- Line 40: `it("keeps a public web search separate from attachments and clears the marker after sending", async () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:40`

- Line 54: `it("appends a completed dictation to the draft without sending it", async () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:54`

- Line 66: `it("cancels a pending dictation and ignores a stale transcript", async () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:66`

- Line 80: `it("focuses the composer and sends a saved document without uploading again", async () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:80`

- Line 90: `it("combines a saved file with a newly uploaded file", async () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:90`

- Line 101: `it("retains saved context on failure and lets the user remove it", async () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:101`

- Line 113: `it("enforces the combined ten-file limit before uploading or sending", async () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:113`

- Line 123: `it("keeps a rejected draft and attachment, then reuses the upload when retrying", async () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:123`

- Line 141: `it("keeps the draft on upload failure and never sends incomplete attachments", async () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:141`

- Line 153: `it("uploads only newly added files after a failed send", async () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:153`

- Line 170: `it("locks the whole composer while a send is pending", async () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:170`

- Line 188: `it("does not send when Enter confirms IME composition or inserts a new line", async () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:188`

- Line 201: `it("keeps the message if the caller rejects instead of returning a result", async () => {`
  - Source: `client/src/features/chat/ChatInput.test.tsx:201`

## `client/src/features/chat/ChatMessage.test.tsx`

- Line 29: `it("shows input, output and total tokens on the assistant reply", () => {`
  - Source: `client/src/features/chat/ChatMessage.test.tsx:29`

- Line 34: `it("shows zero new tokens for a cached reply even when its metadata has historical usage", () => {`
  - Source: `client/src/features/chat/ChatMessage.test.tsx:34`

- Line 40: `it("shows unavailable usage when a model call has no measured counts", () => {`
  - Source: `client/src/features/chat/ChatMessage.test.tsx:40`

- Line 45: `it("does not render images from model Markdown and omits the referrer on links", () => {`
  - Source: `client/src/features/chat/ChatMessage.test.tsx:45`

- Line 52: `it("waits for the actual clipboard write before confirming and retains the exact quote", async () => {`
  - Source: `client/src/features/chat/ChatMessage.test.tsx:52`

- Line 64: `it("reports clipboard rejection without claiming the response was copied", async () => {`
  - Source: `client/src/features/chat/ChatMessage.test.tsx:64`

- Line 72: `it("does not play the demo chime as the spoken answer", async () => {`
  - Source: `client/src/features/chat/ChatMessage.test.tsx:72`

- Line 92: `it("keeps numbered plan headings on the same line as their list marker", () => {`
  - Source: `client/src/features/chat/ChatMessage.test.tsx:92`

## `client/src/features/chat/ChatMessageFeedback.test.tsx`

- Line 53: `it("restores the persisted thumbs state after reload", () => {`
  - Source: `client/src/features/chat/ChatMessageFeedback.test.tsx:53`

- Line 61: `it("thumbs-down saves the rating, then submits reason chip and capped correction", async () => {`
  - Source: `client/src/features/chat/ChatMessageFeedback.test.tsx:61`

- Line 84: `it("thumbs-up never opens the details panel", async () => {`
  - Source: `client/src/features/chat/ChatMessageFeedback.test.tsx:84`

- Line 91: `it("regenerate resends the previous question linked to this output with cache bypass", () => {`
  - Source: `client/src/features/chat/ChatMessageFeedback.test.tsx:91`

## `client/src/features/chat/ChatMessageList.test.tsx`

- Line 27: `describe("chat answer visibility", () => {`
  - Source: `client/src/features/chat/ChatMessageList.test.tsx:27`

- Line 28: `it("reveals the beginning of a saved answer after loading", () => {`
  - Source: `client/src/features/chat/ChatMessageList.test.tsx:28`

- Line 36: `it("follows a pending send, then reveals the answer rather than its action-card footer", () => {`
  - Source: `client/src/features/chat/ChatMessageList.test.tsx:36`

- Line 44: `it("does not move the reader when message metadata refreshes", () => {`
  - Source: `client/src/features/chat/ChatMessageList.test.tsx:44`

## `client/src/features/chat/LiveVoiceChat.test.tsx`

- Line 16: `describe("live voice chat", () => {`
  - Source: `client/src/features/chat/LiveVoiceChat.test.tsx:16`

- Line 17: `it("keeps the default transcript editable before sending", async () => {`
  - Source: `client/src/features/chat/LiveVoiceChat.test.tsx:17`

- Line 26: `it("sends an opted-in microphone turn and listens again after speech ends", async () => {`
  - Source: `client/src/features/chat/LiveVoiceChat.test.tsx:26`

## `client/src/hooks/use-mobile.test.tsx`

- Line 12: `describe("responsive navigation breakpoint", () => {`
  - Source: `client/src/hooks/use-mobile.test.tsx:12`

- Line 13: `it("keeps tablet navigation available until the desktop sidebar is visible", () => {`
  - Source: `client/src/hooks/use-mobile.test.tsx:13`

- Line 34: `it("keeps the default phone breakpoint for existing consumers", () => {`
  - Source: `client/src/hooks/use-mobile.test.tsx:34`

## `client/src/hooks/useAIStream.test.tsx`

- Line 19: `it("aborts an unmounted stream and ignores a late response from the old workspace", async () => {`
  - Source: `client/src/hooks/useAIStream.test.tsx:19`

- Line 32: `it("does not let an older stream complete or unlock the current stream", async () => {`
  - Source: `client/src/hooks/useAIStream.test.tsx:32`

- Line 50: `it("completes a current SSE response and releases the response reader", async () => {`
  - Source: `client/src/hooks/useAIStream.test.tsx:50`

## `client/src/hooks/useAuth.test.tsx`

- Line 56: `describe("useAuth", () => {`
  - Source: `client/src/hooks/useAuth.test.tsx:56`

- Line 57: `it("retains a verified account and workspace during a transient rate limit", async () => {`
  - Source: `client/src/hooks/useAuth.test.tsx:57`

- Line 69: `it("does not escalate an expected rate limit into an uncaught global error report", async () => {`
  - Source: `client/src/hooks/useAuth.test.tsx:69`

- Line 91: `it("keeps protected content hidden and offers retry after an unavailable boot check", async () => {`
  - Source: `client/src/hooks/useAuth.test.tsx:91`

- Line 100: `it("shows loading state initially, then displays user profile", async () => {`
  - Source: `client/src/hooks/useAuth.test.tsx:100`

- Line 117: `it("shows unauthenticated state when API returns 401", async () => {`
  - Source: `client/src/hooks/useAuth.test.tsx:117`

- Line 135: `it("clears user state on logout", async () => {`
  - Source: `client/src/hooks/useAuth.test.tsx:135`

- Line 158: `it("throws when used outside AuthProvider", () => {`
  - Source: `client/src/hooks/useAuth.test.tsx:158`

- Line 169: `it("does not restore an account from a profile request that finishes after logout", async () => {`
  - Source: `client/src/hooks/useAuth.test.tsx:169`

- Line 188: `it("keeps the newest profile and clears the previous account's organization", async () => {`
  - Source: `client/src/hooks/useAuth.test.tsx:188`

## `client/src/hooks/useVirtualList.test.tsx`

- Line 13: `describe("virtual list scrolling", () => {`
  - Source: `client/src/hooks/useVirtualList.test.tsx:13`

- Line 14: `it("renders the new viewport after scrolling instead of leaving the first rows frozen", () => {`
  - Source: `client/src/hooks/useVirtualList.test.tsx:14`

## `client/src/lib/api/core.test.ts`

- Line 23: `it("does not clear the new workspace when an old read is denied", async () => {`
  - Source: `client/src/lib/api/core.test.ts:23`

- Line 32: `it("does not replay an old write after switching away and back", async () => {`
  - Source: `client/src/lib/api/core.test.ts:32`

- Line 41: `it("rechecks the owner after awaiting CSRF refresh", async () => {`
  - Source: `client/src/lib/api/core.test.ts:41`

- Line 52: `it("does not open a previous account's feature-limit dialog", async () => {`
  - Source: `client/src/lib/api/core.test.ts:52`

- Line 60: `it("detects another tab's workspace change before its storage event is handled", async () => {`
  - Source: `client/src/lib/api/core.test.ts:60`

- Line 70: `it("does not replay a write under a different stored account in the same workspace", async () => {`
  - Source: `client/src/lib/api/core.test.ts:70`

- Line 79: `it("preserves CSRF recovery for a current write and its organization", async () => {`
  - Source: `client/src/lib/api/core.test.ts:79`

- Line 90: `it("preserves safe-read recovery when the current stored organization is stale", async () => {`
  - Source: `client/src/lib/api/core.test.ts:90`

## `client/src/lib/apiBase.test.ts`

- Line 5: `describe("API path boundaries", () => {`
  - Source: `client/src/lib/apiBase.test.ts:5`

- Line 6: `it.each([`
  - Source: `client/src/lib/apiBase.test.ts:6`

- Line 18: `it("keeps API key routes under a separate API origin", async () => {`
  - Source: `client/src/lib/apiBase.test.ts:18`

## `client/src/lib/chatResponse.test.ts`

- Line 5: `it("retains both a quoted document answer and the complete financial plan", () => {`
  - Source: `client/src/lib/chatResponse.test.ts:5`

- Line 9: `it("keeps a standalone financial plan visible", () => {`
  - Source: `client/src/lib/chatResponse.test.ts:9`

- Line 13: `it("does not split ordinary prose or a quoted heading inside a document", () => {`
  - Source: `client/src/lib/chatResponse.test.ts:13`

- Line 18: `it("supports CRLF and preserves all plan content", () => {`
  - Source: `client/src/lib/chatResponse.test.ts:18`

## `client/src/lib/chunkRecovery.test.ts`

- Line 13: `it("refreshes an outdated deployment once and suppresses the import error", () => {`
  - Source: `client/src/lib/chunkRecovery.test.ts:13`

- Line 20: `it("keeps persistent failures visible after a reload instead of looping", () => {`
  - Source: `client/src/lib/chunkRecovery.test.ts:20`

- Line 30: `it("allows recovery after the deployment retry cooldown", () => {`
  - Source: `client/src/lib/chunkRecovery.test.ts:30`

- Line 39: `it("does not trigger an unsafe reload when session storage is unavailable", () => {`
  - Source: `client/src/lib/chunkRecovery.test.ts:39`

## `client/src/lib/devLogger.test.ts`

- Line 19: `describe("devLogger", () => {`
  - Source: `client/src/lib/devLogger.test.ts:19`

- Line 32: `describe("installNetworkLogger", () => {`
  - Source: `client/src/lib/devLogger.test.ts:32`

- Line 33: `it("replaces window.fetch with instrumented version", () => {`
  - Source: `client/src/lib/devLogger.test.ts:33`

- Line 38: `it("preserves fetch functionality", async () => {`
  - Source: `client/src/lib/devLogger.test.ts:38`

- Line 48: `it("logs requests to the buffer", async () => {`
  - Source: `client/src/lib/devLogger.test.ts:48`

- Line 69: `describe("performance marks", () => {`
  - Source: `client/src/lib/devLogger.test.ts:69`

- Line 70: `it("startPerfMark and endPerfMark measure duration", () => {`
  - Source: `client/src/lib/devLogger.test.ts:70`

- Line 87: `describe("request buffer", () => {`
  - Source: `client/src/lib/devLogger.test.ts:87`

- Line 88: `it("getRequestLogs returns a copy of the buffer", () => {`
  - Source: `client/src/lib/devLogger.test.ts:88`

- Line 93: `it("clearRequestLogs empties the buffer", async () => {`
  - Source: `client/src/lib/devLogger.test.ts:93`

## `client/src/lib/gnaniChallenge.test.ts`

- Line 4: `describe("submission countdown", () => {`
  - Source: `client/src/lib/gnaniChallenge.test.ts:4`

- Line 7: `it("uses the published IST deadline and includes days", () => {`
  - Source: `client/src/lib/gnaniChallenge.test.ts:7`

- Line 12: `it("shows the last partial second and stops at the deadline", () => {`
  - Source: `client/src/lib/gnaniChallenge.test.ts:12`

## `client/src/lib/idempotency.test.ts`

- Line 7: `describe("idempotency helpers", () => {`
  - Source: `client/src/lib/idempotency.test.ts:7`

- Line 8: `it("generates keys the server will accept", () => {`
  - Source: `client/src/lib/idempotency.test.ts:8`

- Line 14: `it("generates a distinct key for each user action", () => {`
  - Source: `client/src/lib/idempotency.test.ts:14`

- Line 19: `it("builds the header only when a key is provided", () => {`
  - Source: `client/src/lib/idempotency.test.ts:19`

## `client/src/lib/runtimeLogger.test.ts`

- Line 19: `describe("runtimeLogger", () => {`
  - Source: `client/src/lib/runtimeLogger.test.ts:19`

- Line 36: `describe("reportClientError", () => {`
  - Source: `client/src/lib/runtimeLogger.test.ts:36`

- Line 37: `it("logs error message in development mode", () => {`
  - Source: `client/src/lib/runtimeLogger.test.ts:37`

- Line 43: `it("calls reportError API when error is an Error instance", () => {`
  - Source: `client/src/lib/runtimeLogger.test.ts:43`

- Line 50: `it("does not call reportError for non-Error values", () => {`
  - Source: `client/src/lib/runtimeLogger.test.ts:50`

- Line 56: `it("handles missing reportError gracefully", () => {`
  - Source: `client/src/lib/runtimeLogger.test.ts:56`

- Line 65: `describe("reportClientWarning", () => {`
  - Source: `client/src/lib/runtimeLogger.test.ts:65`

- Line 66: `it("logs warning message in development mode", () => {`
  - Source: `client/src/lib/runtimeLogger.test.ts:66`

- Line 71: `it("includes details when provided", () => {`
  - Source: `client/src/lib/runtimeLogger.test.ts:71`

- Line 77: `describe("reportClientInfo", () => {`
  - Source: `client/src/lib/runtimeLogger.test.ts:77`

- Line 78: `it("logs info message in development mode", () => {`
  - Source: `client/src/lib/runtimeLogger.test.ts:78`

- Line 84: `describe("reportClientDebug", () => {`
  - Source: `client/src/lib/runtimeLogger.test.ts:84`

- Line 85: `it("logs debug message in development mode", () => {`
  - Source: `client/src/lib/runtimeLogger.test.ts:85`

## `client/src/lib/voiceRecording.test.ts`

- Line 5: `it.each([8000, 16000])("encodes mono PCM WAV at %i Hz", async (sampleRate) => {`
  - Source: `client/src/lib/voiceRecording.test.ts:5`

## `client/src/pages/AcceptInvite.test.tsx`

- Line 42: `describe("AcceptInvite", () => {`
  - Source: `client/src/pages/AcceptInvite.test.tsx:42`

- Line 47: `it("reads the invite token from the query string and accepts it for a signed-in user", async () => {`
  - Source: `client/src/pages/AcceptInvite.test.tsx:47`

- Line 63: `it("shows sign-in options (not 'missing token') for a signed-out user with a token", async () => {`
  - Source: `client/src/pages/AcceptInvite.test.tsx:63`

- Line 73: `it("shows the missing-token message when no token is present", () => {`
  - Source: `client/src/pages/AcceptInvite.test.tsx:73`

## `client/src/pages/ActivityFeed.test.tsx`

- Line 67: `describe("ActivityFeedPage", () => {`
  - Source: `client/src/pages/ActivityFeed.test.tsx:67`

- Line 77: `it("renders page header, refresh button, filter chips, and timeline items", async () => {`
  - Source: `client/src/pages/ActivityFeed.test.tsx:77`

- Line 99: `it("filters activities by event type when clicking filter chips", async () => {`
  - Source: `client/src/pages/ActivityFeed.test.tsx:99`

- Line 118: `it("filters activities by search query in real-time", async () => {`
  - Source: `client/src/pages/ActivityFeed.test.tsx:118`

- Line 141: `it("loads more activities when clicking Load more button", async () => {`
  - Source: `client/src/pages/ActivityFeed.test.tsx:141`

- Line 184: `it("displays empty state when search matches no activities", async () => {`
  - Source: `client/src/pages/ActivityFeed.test.tsx:184`

- Line 198: `it("displays empty state when initial feed is empty", async () => {`
  - Source: `client/src/pages/ActivityFeed.test.tsx:198`

## `client/src/pages/AiLearning.test.tsx`

- Line 76: `it("renders artifacts, canary progress and the review queue for admins", async () => {`
  - Source: `client/src/pages/AiLearning.test.tsx:76`

- Line 84: `it("promotes an artifact and decides a review item", async () => {`
  - Source: `client/src/pages/AiLearning.test.tsx:84`

- Line 93: `it("disables promote in suggest-only mode", async () => {`
  - Source: `client/src/pages/AiLearning.test.tsx:93`

- Line 101: `it("shows a clean message when the server refuses with GATE_NOT_PASSED", async () => {`
  - Source: `client/src/pages/AiLearning.test.tsx:101`

- Line 109: `it("is not available to members", () => {`
  - Source: `client/src/pages/AiLearning.test.tsx:109`

## `client/src/pages/AllInsights.test.tsx`

- Line 91: `describe("AllInsights page", () => {`
  - Source: `client/src/pages/AllInsights.test.tsx:91`

- Line 100: `it("renders page header, metric counters, and all insights", () => {`
  - Source: `client/src/pages/AllInsights.test.tsx:100`

- Line 122: `it("filters insights by priority when clicking priority filter pills", () => {`
  - Source: `client/src/pages/AllInsights.test.tsx:122`

- Line 147: `it("filters insights by text search query", () => {`
  - Source: `client/src/pages/AllInsights.test.tsx:147`

- Line 166: `it("opens InsightDetailModal when an insight card is clicked", async () => {`
  - Source: `client/src/pages/AllInsights.test.tsx:166`

- Line 184: `it("navigates to relevant feature page when clicking Take Action button", () => {`
  - Source: `client/src/pages/AllInsights.test.tsx:184`

- Line 203: `it("renders empty state with Ask Copilot action when no insights exist", () => {`
  - Source: `client/src/pages/AllInsights.test.tsx:203`

## `client/src/pages/Analytics.test.tsx`

- Line 142: `describe("Analytics Page", () => {`
  - Source: `client/src/pages/Analytics.test.tsx:142`

- Line 175: `it("renders page header and stat cards with formatted values", async () => {`
  - Source: `client/src/pages/Analytics.test.tsx:175`

- Line 198: `it("renders all four primary analytical chart cards", async () => {`
  - Source: `client/src/pages/Analytics.test.tsx:198`

- Line 213: `it("uses the workspace currency and preserves cents in totals", async () => {`
  - Source: `client/src/pages/Analytics.test.tsx:213`

- Line 230: `it("shows a retryable failure instead of inventing zero totals", async () => {`
  - Source: `client/src/pages/Analytics.test.tsx:230`

- Line 241: `it("does not label mixed-currency balances as a single converted net worth", async () => {`
  - Source: `client/src/pages/Analytics.test.tsx:241`

- Line 251: `it("allows switching time range to 3M and 6M", async () => {`
  - Source: `client/src/pages/Analytics.test.tsx:251`

- Line 275: `it("renders empty state when no financial data is returned", async () => {`
  - Source: `client/src/pages/Analytics.test.tsx:275`

- Line 296: `it("renders spending velocity metrics and day-of-week heatmap card", async () => {`
  - Source: `client/src/pages/Analytics.test.tsx:296`

- Line 324: `it("allows switching spending heatmap range between 30D, 180D, and 365D", async () => {`
  - Source: `client/src/pages/Analytics.test.tsx:324`

- Line 349: `it("calculates liquid cash runway accurately from checking and savings accounts", async () => {`
  - Source: `client/src/pages/Analytics.test.tsx:349`

- Line 361: `it("renders multi-currency normalization cockpit with default USD reporting currency", async () => {`
  - Source: `client/src/pages/Analytics.test.tsx:361`

- Line 382: `it("switches reporting currency via select dropdown to EUR and updates FX badge and API queries", async () => {`
  - Source: `client/src/pages/Analytics.test.tsx:382`

- Line 407: `it("switches currency via quick button to JPY and formats amounts with JPY integer rounding", async () => {`
  - Source: `client/src/pages/Analytics.test.tsx:407`

## `client/src/pages/Billing.test.tsx`

- Line 71: `describe("Billing page", () => {`
  - Source: `client/src/pages/Billing.test.tsx:71`

- Line 115: `it("renders page header, current plan badge, quota meters, and plan options", () => {`
  - Source: `client/src/pages/Billing.test.tsx:115`

- Line 139: `it("does not present a canceled paid subscription as the current paid plan", () => {`
  - Source: `client/src/pages/Billing.test.tsx:139`

- Line 148: `it("fills the shell width so the invoice table cannot widen the page past a phone viewport", () => {`
  - Source: `client/src/pages/Billing.test.tsx:148`

- Line 154: `it("triggers upgrade to Pro and handles instant activation", async () => {`
  - Source: `client/src/pages/Billing.test.tsx:154`

- Line 181: `it("handles Stripe checkout URL redirect response", async () => {`
  - Source: `client/src/pages/Billing.test.tsx:181`

- Line 209: `it("opens Stripe billing portal via customer portal action", async () => {`
  - Source: `client/src/pages/Billing.test.tsx:209`

- Line 234: `it("renders error alert when upgrade checkout rejects", async () => {`
  - Source: `client/src/pages/Billing.test.tsx:234`

- Line 250: `it("renders proactive quota warning alert when a meter reaches 80% or 100%", () => {`
  - Source: `client/src/pages/Billing.test.tsx:250`

- Line 263: `it("renders on-demand credit packs catalog with all 4 booster cards", () => {`
  - Source: `client/src/pages/Billing.test.tsx:263`

- Line 281: `it("never offers credit checkout while the server cannot verify payment", () => {`
  - Source: `client/src/pages/Billing.test.tsx:281`

- Line 289: `it("labels annual prices as illustrative and blocks annual checkout", () => {`
  - Source: `client/src/pages/Billing.test.tsx:289`

- Line 308: `it("renders organization invoices history and allows downloading official PDF tax receipts", async () => {`
  - Source: `client/src/pages/Billing.test.tsx:308`

- Line 354: `it("handles empty invoices state and invoice download failures gracefully", async () => {`
  - Source: `client/src/pages/Billing.test.tsx:354`

- Line 395: `it("renders dunning grace period alert banner when subscription payment is past due", async () => {`
  - Source: `client/src/pages/Billing.test.tsx:395`

- Line 423: `it("executes payment retry recovery from dunning banner and updates subscription", async () => {`
  - Source: `client/src/pages/Billing.test.tsx:423`

- Line 463: `it("renders multi-currency selector and passes selected currency to invoice query", async () => {`
  - Source: `client/src/pages/Billing.test.tsx:463`

## `client/src/pages/Dashboard.test.tsx`

- Line 115: `describe("Dashboard page", () => {`
  - Source: `client/src/pages/Dashboard.test.tsx:115`

- Line 125: `it("renders personalized greeting, date, and quick-launch action cards", async () => {`
  - Source: `client/src/pages/Dashboard.test.tsx:125`

- Line 148: `it("renders recent conversations when loaded and links to chat sessions", async () => {`
  - Source: `client/src/pages/Dashboard.test.tsx:148`

- Line 167: `it("displays empty state when there are no recent chat sessions", async () => {`
  - Source: `client/src/pages/Dashboard.test.tsx:167`

- Line 180: `it("renders Trust and Close metrics, review queue counts, and proactive anomalies", async () => {`
  - Source: `client/src/pages/Dashboard.test.tsx:180`

- Line 209: `it("renders monthly close as 'Ready' when ready_to_close is true", async () => {`
  - Source: `client/src/pages/Dashboard.test.tsx:209`

- Line 228: `it("handles loading or absent dashboard summary gracefully without crashing", async () => {`
  - Source: `client/src/pages/Dashboard.test.tsx:228`

## `client/src/pages/Exports.test.tsx`

- Line 136: `describe("Exports page", () => {`
  - Source: `client/src/pages/Exports.test.tsx:136`

- Line 154: `it("renders page header, export cards, and list of export jobs", async () => {`
  - Source: `client/src/pages/Exports.test.tsx:154`

- Line 174: `it("displays entitlement upgrade banner when export access is disabled on free tier", () => {`
  - Source: `client/src/pages/Exports.test.tsx:174`

- Line 193: `it("applies CSV date presets when clicking preset buttons", () => {`
  - Source: `client/src/pages/Exports.test.tsx:193`

- Line 210: `it("submits transactions CSV export mutation with filters", async () => {`
  - Source: `client/src/pages/Exports.test.tsx:210`

- Line 244: `it("sends an inclusive 'Date to' as the exclusive next-day bound the API expects", async () => {`
  - Source: `client/src/pages/Exports.test.tsx:244`

- Line 260: `it("rejects an inverted CSV date range without creating an export", () => {`
  - Source: `client/src/pages/Exports.test.tsx:260`

- Line 271: `it("validates and submits monthly summary PDF export", async () => {`
  - Source: `client/src/pages/Exports.test.tsx:271`

- Line 306: `it("downloads succeeded export file via browser download trigger", async () => {`
  - Source: `client/src/pages/Exports.test.tsx:306`

- Line 335: `it("renders empty state when no export jobs exist", async () => {`
  - Source: `client/src/pages/Exports.test.tsx:335`

- Line 348: `it("allows selecting custom columns and submits them in CSV export request", async () => {`
  - Source: `client/src/pages/Exports.test.tsx:348`

- Line 386: `it("renders scheduled recurring reports card with active and paused schedules", async () => {`
  - Source: `client/src/pages/Exports.test.tsx:386`

- Line 404: `it("creates a new scheduled recurring export report via dialog", async () => {`
  - Source: `client/src/pages/Exports.test.tsx:404`

- Line 448: `it("toggles schedule status between active and paused", async () => {`
  - Source: `client/src/pages/Exports.test.tsx:448`

- Line 476: `it("triggers 1-click test delivery now and shows toast notification", async () => {`
  - Source: `client/src/pages/Exports.test.tsx:476`

- Line 506: `it("deletes a recurring schedule", async () => {`
  - Source: `client/src/pages/Exports.test.tsx:506`

- Line 530: `it("renders multi-channel destinations for webhooks and cloud storage and displays destination badges", async () => {`
  - Source: `client/src/pages/Exports.test.tsx:530`

- Line 577: `it("triggers test delivery for webhook and cloud storage targets with specific toast details", async () => {`
  - Source: `client/src/pages/Exports.test.tsx:577`

## `client/src/pages/Files.test.tsx`

- Line 83: `it("shows a recoverable list failure instead of claiming the workspace is empty", async () => {`
  - Source: `client/src/pages/Files.test.tsx:83`

- Line 93: `it("does not describe a file whose extraction failed as ready", async () => {`
  - Source: `client/src/pages/Files.test.tsx:93`

- Line 102: `it("recovers a failed detail request and exposes the stored PDF pages", async () => {`
  - Source: `client/src/pages/Files.test.tsx:102`

- Line 115: `it("opens an exact file page from a citation, updates its URL and clears the selection on close", async () => {`
  - Source: `client/src/pages/Files.test.tsx:115`

- Line 130: `it("ignores an invalid file reference without making a detail request", async () => {`
  - Source: `client/src/pages/Files.test.tsx:130`

- Line 138: `it("keeps the conversation return path while paging and returns there when the source closes", async () => {`
  - Source: `client/src/pages/Files.test.tsx:138`

- Line 154: `it("does not offer or follow an untrusted return destination", async () => {`
  - Source: `client/src/pages/Files.test.tsx:154`

- Line 165: `describe("Multi-Modal Grounded RAG Search Cockpit", () => {`
  - Source: `client/src/pages/Files.test.tsx:165`

- Line 210: `it("switches to Multi-Modal Grounded RAG Search tab and renders search controls", async () => {`
  - Source: `client/src/pages/Files.test.tsx:210`

- Line 225: `it("triggers search and renders multi-modal chunks with citations, modality badges, and entities", async () => {`
  - Source: `client/src/pages/Files.test.tsx:225`

- Line 257: `it("filters search by modality button selection", async () => {`
  - Source: `client/src/pages/Files.test.tsx:257`

- Line 339: `describe("Unified Memory & Context Retrieval Cockpit", () => {`
  - Source: `client/src/pages/Files.test.tsx:339`

- Line 340: `it("switches to Unified Memory & Context tab and renders cockpit container", async () => {`
  - Source: `client/src/pages/Files.test.tsx:340`

- Line 355: `it("triggers unified search and renders ranked items with RRF scores across memory, files, and transactions", async () => {`
  - Source: `client/src/pages/Files.test.tsx:355`

- Line 398: `it("toggles source silos and filters retrieval scope", async () => {`
  - Source: `client/src/pages/Files.test.tsx:398`

- Line 432: `describe("Document Q&A & Semantic Page Grounding Cockpit", () => {`
  - Source: `client/src/pages/Files.test.tsx:432`

- Line 433: `it("opens the source belonging to each passage even when two files cite the same page", async () => {`
  - Source: `client/src/pages/Files.test.tsx:433`

- Line 450: `it("labels unpaginated source text without inventing a page or currency", async () => {`
  - Source: `client/src/pages/Files.test.tsx:450`

- Line 466: `it("renders the Document Q&A cockpit and asks questions with exact page citations", async () => {`
  - Source: `client/src/pages/Files.test.tsx:466`

- Line 499: `it("triggers preset inquiry and populates question input", async () => {`
  - Source: `client/src/pages/Files.test.tsx:499`

- Line 521: `describe("Document Authorship & Studio Tab", () => {`
  - Source: `client/src/pages/Files.test.tsx:521`

- Line 522: `it("preserves custom notes and metrics across format changes and allows profile data to be excluded", async () => {`
  - Source: `client/src/pages/Files.test.tsx:522`

- Line 538: `it("switches to Document Authorship tab and loads format presets", async () => {`
  - Source: `client/src/pages/Files.test.tsx:538`

- Line 559: `it("allows adding and removing custom KPIs", async () => {`
  - Source: `client/src/pages/Files.test.tsx:559`

- Line 588: `it("generates authored PDF document and displays success result card", async () => {`
  - Source: `client/src/pages/Files.test.tsx:588`

## `client/src/pages/FinanceOS.test.tsx`

- Line 105: `describe("FinanceOS", () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:105`

- Line 122: `it("renders Accounts tab by default with registered accounts", async () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:122`

- Line 131: `it("activates Budgets tab directly when ?tab=budgets is in URL", async () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:131`

- Line 141: `it("applies category presets on click and allows clearing the form", async () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:141`

- Line 167: `it("submits upsert allocation and deletes existing allocation", async () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:167`

- Line 202: `it("refetches envelopes after an upsert so remaining reflects the new allocation", async () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:202`

- Line 224: `it("rejects an empty budget amount instead of saving a zero allocation", async () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:224`

- Line 235: `it("steps monthly budget periods using previous and next month buttons", async () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:235`

- Line 250: `it("opens Roll Forward dialog and copies allocations from previous month", async () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:250`

- Line 302: `it("opens Smart Budget Recommendations dialog and applies calculated spending caps", async () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:302`

- Line 340: `it("does not invent caps from defaults or current-period envelopes when history is empty", async () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:340`

- Line 354: `it("blocks recommendations on history failure and supports retry without fictional fallbacks", async () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:354`

- Line 367: `it("preserves cents, native history currency and deselection when the buffer changes", async () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:367`

- Line 387: `it("renders live envelope spend, remaining balance, and burn indicators", async () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:387`

- Line 404: `it("switches multi-currency reporting to EUR and JPY with active FX rate badges and localized allocations", async () => {`
  - Source: `client/src/pages/FinanceOS.test.tsx:404`

## `client/src/pages/FinancialCalendar.test.tsx`

- Line 94: `it.each([`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:94`

- Line 119: `describe("FinancialCalendar Page", () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:119`

- Line 120: `it("does not invent an opening balance or safe forecast before the user supplies one", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:120`

- Line 128: `it("uses explicit cent, zero and negative opening balances and counts investment outflows", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:128`

- Line 233: `it("renders page header, monthly totals, and weekday grid", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:233`

- Line 254: `it("displays reminder indicator dots on cells and opens day detail on click", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:254`

- Line 280: `it("adds a new reminder using preset pill and submits mutation", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:280`

- Line 322: `it("toggles and deletes reminders with toast feedback", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:322`

- Line 362: `it("opens Add Transaction dialog for selected day and saves transaction", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:362`

- Line 409: `it("navigates next month, previous month, and restores today", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:409`

- Line 430: `it("opens sync recurring bills dialog, selects candidate bill, and schedules reminder", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:430`

- Line 466: `it("exports calendar reminders to RFC 5545 .ics format", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:466`

- Line 493: `it("escapes commas/semicolons in .ics text and never emits VTODO-only STATUS:COMPLETED", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:493`

- Line 528: `it("always shows two decimals for amounts with cents in the liquidity forecast", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:528`

- Line 545: `it("renders multi-currency normalization cockpit and switches reporting currencies with live FX rates", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:545`

- Line 569: `it("calculates daily running liquidity forecast, flags dip days, and schedules a protection task", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:569`

- Line 609: `it("executes batch complete and clear completed reminders with toast notifications", async () => {`
  - Source: `client/src/pages/FinancialCalendar.test.tsx:609`

## `client/src/pages/FinancialStory.test.tsx`

- Line 16: `it("loads full milestone records instead of the lightweight recent-output index", async () => {`
  - Source: `client/src/pages/FinancialStory.test.tsx:16`

- Line 28: `it("labels completed goals as achieved (not overdue) and guards zero targets", async () => {`
  - Source: `client/src/pages/FinancialStory.test.tsx:28`

## `client/src/pages/GoalsAndDebts.test.tsx`

- Line 31: `it("accepts cents in goal amounts and submits the exact values", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:31`

- Line 42: `it("keeps an ISO deadline editable and preserves it when saving", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:42`

- Line 51: `it("accepts fractional debt interest and minimum payments", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:51`

- Line 61: `it("does not offer an empty editor when profile loading fails", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:61`

- Line 68: `it("displays goal funding summary and monthly contribution pace", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:68`

- Line 81: `it("displays debt liability summary and avalanche strategy recommendation", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:81`

- Line 97: `it("schedules an accelerated debt payoff plan task with one click", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:97`

- Line 119: `it("creates an action task from a goal with one click", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:119`

- Line 140: `it("detects goal milestone drift and auto-schedules catch-up task", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:140`

- Line 170: `it("flags overdue goal drift and schedules realignment task", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:170`

- Line 198: `it("renders multi-goal portfolio rebalancing and switches strategies", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:198`

- Line 224: `it("schedules a multi-goal savings plan task with one click", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:224`

- Line 252: `it("distributes lump-sum windfall across multiple goals and updates balances", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:252`

- Line 298: `it("renders multi-currency normalization cockpit and switches reporting currencies with live FX rates", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:298`

- Line 329: `it("simulates dynamic savings transfer rules (surplus, roundup, debt sweep, windfall) and schedules tasks", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:329`

- Line 387: `it("gracefully calculates dynamic savings transfers when user has no active goals or debts", async () => {`
  - Source: `client/src/pages/GoalsAndDebts.test.tsx:387`

## `client/src/pages/goalsDebtsMath.test.ts`

- Line 4: `describe("singleDebtPayoff", () => {`
  - Source: `client/src/pages/goalsDebtsMath.test.ts:4`

- Line 5: `it("charges a partial final payment instead of a full extra minimum", () => {`
  - Source: `client/src/pages/goalsDebtsMath.test.ts:5`

- Line 15: `it("handles 0% APR", () => {`
  - Source: `client/src/pages/goalsDebtsMath.test.ts:15`

- Line 19: `it("flags a debt whose minimum never covers interest as not paid off", () => {`
  - Source: `client/src/pages/goalsDebtsMath.test.ts:19`

- Line 24: `describe("simulatePayoff", () => {`
  - Source: `client/src/pages/goalsDebtsMath.test.ts:24`

- Line 30: `it("rolls freed-up minimum payments into the next debt (snowball/avalanche)", () => {`
  - Source: `client/src/pages/goalsDebtsMath.test.ts:30`

- Line 40: `it("reports not paid off when minimums never cover interest", () => {`
  - Source: `client/src/pages/goalsDebtsMath.test.ts:40`

- Line 50: `it("returns an empty result for no active debts", () => {`
  - Source: `client/src/pages/goalsDebtsMath.test.ts:50`

- Line 59: `it("avalanche never pays more interest than snowball", () => {`
  - Source: `client/src/pages/goalsDebtsMath.test.ts:59`

- Line 67: `describe("allocateByWeight (windfall split)", () => {`
  - Source: `client/src/pages/goalsDebtsMath.test.ts:67`

- Line 68: `it("distributes every cent of a windfall", () => {`
  - Source: `client/src/pages/goalsDebtsMath.test.ts:68`

- Line 79: `it("redistributes the excess above a goal's remaining balance to other goals", () => {`
  - Source: `client/src/pages/goalsDebtsMath.test.ts:79`

- Line 88: `it("never allocates more than the total remaining across goals", () => {`
  - Source: `client/src/pages/goalsDebtsMath.test.ts:88`

## `client/src/pages/GoogleSignIn.test.tsx`

- Line 50: `describe("Continue with Google (Login)", () => {`
  - Source: `client/src/pages/GoogleSignIn.test.tsx:50`

- Line 51: `it("is hidden when the server reports google:false", async () => {`
  - Source: `client/src/pages/GoogleSignIn.test.tsx:51`

- Line 58: `it("is shown when google:true and starts the server-side flow, keeping ?next=", async () => {`
  - Source: `client/src/pages/GoogleSignIn.test.tsx:58`

- Line 66: `it("drops an open-redirect next value", async () => {`
  - Source: `client/src/pages/GoogleSignIn.test.tsx:66`

- Line 73: `it("shows a clear banner for ?error= from a failed OAuth round trip", async () => {`
  - Source: `client/src/pages/GoogleSignIn.test.tsx:73`

- Line 80: `it("never reflects an unknown error value", async () => {`
  - Source: `client/src/pages/GoogleSignIn.test.tsx:80`

- Line 87: `it("shows no banner without an error", async () => {`
  - Source: `client/src/pages/GoogleSignIn.test.tsx:87`

- Line 94: `it("waits for the second factor after a password-only response", async () => {`
  - Source: `client/src/pages/GoogleSignIn.test.tsx:94`

- Line 114: `it("completes Google MFA without asking for the Google account password", async () => {`
  - Source: `client/src/pages/GoogleSignIn.test.tsx:114`

- Line 132: `describe("Continue with Google (Register)", () => {`
  - Source: `client/src/pages/GoogleSignIn.test.tsx:132`

- Line 133: `it("is hidden when google:false", async () => {`
  - Source: `client/src/pages/GoogleSignIn.test.tsx:133`

- Line 140: `it("is shown when google:true and forwards the referral code", async () => {`
  - Source: `client/src/pages/GoogleSignIn.test.tsx:140`

## `client/src/pages/Notes.test.tsx`

- Line 86: `describe("Notes / Financial Journal Page", () => {`
  - Source: `client/src/pages/Notes.test.tsx:86`

- Line 129: `it("renders disabled banner when journal_enabled feature flag is false", () => {`
  - Source: `client/src/pages/Notes.test.tsx:129`

- Line 146: `it("renders canvas and recent journal entries when feature is enabled", async () => {`
  - Source: `client/src/pages/Notes.test.tsx:146`

- Line 162: `it("triggers handwriting recognition and displays detected values & goal suggestion", async () => {`
  - Source: `client/src/pages/Notes.test.tsx:162`

- Line 210: `it("allows updating monthly expenses", async () => {`
  - Source: `client/src/pages/Notes.test.tsx:210`

- Line 232: `it("opens entry detail sheet when an entry is clicked, saves edits, and generates insights with tasks", async () => {`
  - Source: `client/src/pages/Notes.test.tsx:232`

- Line 304: `it("saves canvas strokes locally as an offline draft and increments pending badge count", async () => {`
  - Source: `client/src/pages/Notes.test.tsx:304`

- Line 321: `it("does not queue or recognize an empty canvas", async () => {`
  - Source: `client/src/pages/Notes.test.tsx:321`

- Line 337: `it("opens a journal entry from the keyboard", async () => {`
  - Source: `client/src/pages/Notes.test.tsx:337`

- Line 355: `it("synchronizes queued offline notes batch and flushes local storage queue", async () => {`
  - Source: `client/src/pages/Notes.test.tsx:355`

- Line 415: `it("performs semantic vector search and displays similarity match badges", async () => {`
  - Source: `client/src/pages/Notes.test.tsx:415`

- Line 466: `it("filters semantic search when clicking category concept tags", async () => {`
  - Source: `client/src/pages/Notes.test.tsx:466`

## `client/src/pages/Organization.test.tsx`

- Line 162: `describe("Organization Page", () => {`
  - Source: `client/src/pages/Organization.test.tsx:162`

- Line 196: `it("renders tenant context and active organization header", async () => {`
  - Source: `client/src/pages/Organization.test.tsx:196`

- Line 206: `it("navigates between organization tabs deterministically", async () => {`
  - Source: `client/src/pages/Organization.test.tsx:206`

- Line 243: `it("updates organization settings when form is submitted", async () => {`
  - Source: `client/src/pages/Organization.test.tsx:243`

- Line 266: `it("adds a member when email is provided", async () => {`
  - Source: `client/src/pages/Organization.test.tsx:266`

- Line 292: `it("creates an API key with specified name and scopes", async () => {`
  - Source: `client/src/pages/Organization.test.tsx:292`

- Line 319: `it("redeems a referral code successfully", async () => {`
  - Source: `client/src/pages/Organization.test.tsx:319`

## `client/src/pages/Portfolio.test.tsx`

- Line 168: `describe("Portfolio Page", () => {`
  - Source: `client/src/pages/Portfolio.test.tsx:168`

- Line 187: `it("renders portfolio overview metrics, asset allocations, and performance summary", async () => {`
  - Source: `client/src/pages/Portfolio.test.tsx:187`

- Line 204: `it("renders Holdings tab with holding details and percentage shares", async () => {`
  - Source: `client/src/pages/Portfolio.test.tsx:204`

- Line 221: `it("displays empty state in Holdings tab when no holdings exist", async () => {`
  - Source: `client/src/pages/Portfolio.test.tsx:221`

- Line 249: `it("populates investment presets and submits new investment mutation", async () => {`
  - Source: `client/src/pages/Portfolio.test.tsx:249`

- Line 294: `it("renders AI Analysis tab with markdown insights", async () => {`
  - Source: `client/src/pages/Portfolio.test.tsx:294`

- Line 306: `it("renders asset allocation drift alert in Overview and navigates to Rebalance tab", async () => {`
  - Source: `client/src/pages/Portfolio.test.tsx:306`

- Line 322: `it("switches target models and displays drift cards with status badges", async () => {`
  - Source: `client/src/pages/Portfolio.test.tsx:322`

- Line 346: `it("switches rebalance modes and schedules a rebalance plan task with one click", async () => {`
  - Source: `client/src/pages/Portfolio.test.tsx:346`

- Line 384: `it("renders dividend summary widget in overview and navigates to Dividends tab", async () => {`
  - Source: `client/src/pages/Portfolio.test.tsx:384`

- Line 401: `it("renders Dividends tab with stat cards, yield on cost breakdown, and monthly chart", async () => {`
  - Source: `client/src/pages/Portfolio.test.tsx:401`

- Line 431: `it("submits record dividend dialog with DRIP reinvestment and schedules DRIP action plan", async () => {`
  - Source: `client/src/pages/Portfolio.test.tsx:431`

- Line 510: `it("renders Multi-Currency FX Cockpit and switches reporting currency to EUR and JPY", async () => {`
  - Source: `client/src/pages/Portfolio.test.tsx:510`

- Line 558: `it("models cross-border dividend withholding tax (WHT) localization with DTAA vs statutory rates", async () => {`
  - Source: `client/src/pages/Portfolio.test.tsx:558`

## `client/src/pages/Receipts.test.tsx`

- Line 100: `it("renders receipt items and filters by status tab", async () => {`
  - Source: `client/src/pages/Receipts.test.tsx:100`

- Line 134: `it("opens detail sheet and confirms transaction from receipt", async () => {`
  - Source: `client/src/pages/Receipts.test.tsx:134`

- Line 168: `it("renders Scan Receipt trigger in page header when feature is enabled", async () => {`
  - Source: `client/src/pages/Receipts.test.tsx:168`

- Line 175: `it("renders disabled message when receipts_ocr_enabled is false", async () => {`
  - Source: `client/src/pages/Receipts.test.tsx:175`

- Line 182: `it("deletes a parsed receipt from detail sheet", async () => {`
  - Source: `client/src/pages/Receipts.test.tsx:182`

- Line 210: `it("shows confirmed notice and disables delete button for confirmed receipts", async () => {`
  - Source: `client/src/pages/Receipts.test.tsx:210`

## `client/src/pages/Scenarios.test.tsx`

- Line 245: `describe("Scenarios page", () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:245`

- Line 259: `it("renders scenario page structure, empty state, and builder form", () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:259`

- Line 272: `it("populates inputs when selecting a quick preset pill", () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:272`

- Line 283: `it("shows validation error if calculate is clicked with invalid or zero amount", () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:283`

- Line 306: `it("submits scenario calculation and renders detailed impact metrics", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:306`

- Line 350: `it("renders projected investment value for investment scenarios", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:350`

- Line 372: `it("supports copying summary breakdown and navigating to Copilot", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:372`

- Line 403: `it("resets scenario when clicking Reset button", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:403`

- Line 422: `it("displays calculation error alert when API call rejects", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:422`

- Line 436: `it("pins scenario to multi-scenario comparison matrix and displays side-by-side metrics", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:436`

- Line 457: `it("loads saved scenario back into builder when clicking load button", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:457`

- Line 485: `it("removes individual saved scenario and clears all pinned scenarios", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:485`

- Line 507: `it("renders marginal tax bracket selector and net take-home calculation for income scenarios", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:507`

- Line 530: `it("renders Monte Carlo stochastic risk bounds and purchasing power metrics", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:530`

- Line 547: `it("exports comparison matrix to CSV and copies Markdown table to clipboard", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:547`

- Line 583: `describe("Historical Macro Scenario Replay & Stress Testing", () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:583`

- Line 584: `it("computes deterministic macro stress metrics for 2008 GFC, COVID 2020, and 1970s Stagflation", () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:584`

- Line 619: `it("renders historical macro crisis replay cockpit with crisis chips and metrics", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:619`

- Line 638: `it("switches active crisis scenario when clicking crisis chips", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:638`

- Line 652: `it("loads macro shock into scenario builder upon clicking Load Shock button", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:652`

- Line 668: `it("schedules crisis resilience plan task into tasks backlog", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:668`

- Line 693: `describe("Dynamic Real-Time Linked Bank / Broker Account Live Stress Testing", () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:693`

- Line 694: `it("computes deterministic per-account stress impact for brokerage, liquid, and credit debt", () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:694`

- Line 723: `it("renders dynamic linked accounts live stress cockpit with live balance aggregates", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:723`

- Line 735: `it("toggles between live accounts mode and manual profile baseline", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:735`

- Line 748: `it("adjusts equity risk sensitivity beta and updates projected drawdowns", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:748`

- Line 769: `it("renders account-level breakdown table and schedules defensive buffer allocation task", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:769`

- Line 801: `describe("Scenario calculation regressions", () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:801`

- Line 802: `it("orders expense Monte Carlo bounds so bearish is the costlier outcome", () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:802`

- Line 815: `it("stress-tests explicit zero savings and investments as zero instead of illustrative defaults", () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:815`

- Line 829: `it("formats raw runway floats from the scenario engine", () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:829`

- Line 835: `it("uses recorded invested capital (not a hard-coded $50,000) for the portfolio drawdown", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:835`

- Line 847: `describe("Scenarios recorded financial baseline", () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:847`

- Line 862: `it("keeps forecasts and task actions unavailable until income, expenses and savings are recorded", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:862`

- Line 884: `it("preserves saved zero income, expenses and savings instead of substituting a sample household", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:884`

- Line 907: `it("does not report a zero-value portfolio or safe account buffer when the saved portfolio fails to load", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:907`

- Line 919: `it("uses selected account zeroes instead of falling back to older profile savings or invested capital", async () => {`
  - Source: `client/src/pages/Scenarios.test.tsx:919`

- Line 937: `it.each(["monthly_income", "monthly_expenses", "savings", "investments"] as const)(`
  - Source: `client/src/pages/Scenarios.test.tsx:937`

## `client/src/pages/Settings.test.tsx`

- Line 96: `describe("Settings Page", () => {`
  - Source: `client/src/pages/Settings.test.tsx:96`

- Line 146: `it("renders page header and user summary stats", async () => {`
  - Source: `client/src/pages/Settings.test.tsx:146`

- Line 158: `it("navigates across all tabs deterministically", async () => {`
  - Source: `client/src/pages/Settings.test.tsx:158`

- Line 194: `it("edits and updates profile information", async () => {`
  - Source: `client/src/pages/Settings.test.tsx:194`

- Line 225: `it("keeps the sign-in email read-only and does not send it on profile save", async () => {`
  - Source: `client/src/pages/Settings.test.tsx:225`

- Line 244: `it("blocks a new password that does not meet the upper/lower/numeric policy", async () => {`
  - Source: `client/src/pages/Settings.test.tsx:244`

- Line 265: `it("changes account password when valid inputs are provided", async () => {`
  - Source: `client/src/pages/Settings.test.tsx:265`

- Line 292: `it("creates a new API key and updates cache", async () => {`
  - Source: `client/src/pages/Settings.test.tsx:292`

- Line 312: `it("saves preferences changes to currency, locale, and timezone", async () => {`
  - Source: `client/src/pages/Settings.test.tsx:312`

## `client/src/pages/Tasks.test.tsx`

- Line 105: `describe("TasksPage", () => {`
  - Source: `client/src/pages/Tasks.test.tsx:105`

- Line 106: `it("updates the open detail sheet after a confirmed completion", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:106`

- Line 214: `it("renders tasks header, metric summary badges, and task cards", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:214`

- Line 240: `it("filters tasks by keyword in search input", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:240`

- Line 257: `it("switches to Completed tab and renders empty state with prompt", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:257`

- Line 274: `it("opens Add Task modal, clicks a preset, and creates a new task", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:274`

- Line 316: `it("completes, dismisses, and applies tasks via row action buttons", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:316`

- Line 356: `it("opens task detail sheet on title click", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:356`

- Line 371: `it("supports multi-task selection, batch complete, and batch dismiss", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:371`

- Line 422: `it("supports batch and single calendar sync via apiClient /calendar-reminders", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:422`

- Line 480: `it("supports exporting tasks to RFC 5545 .ics format both individually, in batch, and from sheet", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:480`

- Line 540: `it("renders recurrence cadence badge on recurring tasks and displays recurrence in task detail sheet", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:540`

- Line 561: `it("creates a recurring task using presets with recurrence cadence", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:561`

- Line 596: `it("celebrates recurring renewal toast when completing a task with scheduled next instance", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:596`

- Line 626: `it("formats tasks for Linear, Todoist, and Jira trackers correctly", () => {`
  - Source: `client/src/pages/Tasks.test.tsx:626`

- Line 643: `it("opens External Sync & Webhook dialog and switches tracker formats", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:643`

- Line 680: `it("dispatches tasks to external webhook via Push Dispatcher tab", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:680`

- Line 712: `it("displays inbound webhook URL and triggers test inbound webhook task creation", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:712`

- Line 767: `it("opens Sync dialog for explicitly selected batch tasks from batch actions bar", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:767`

- Line 784: `describe("Personalized Follow-Through & Ranking Engine", () => {`
  - Source: `client/src/pages/Tasks.test.tsx:784`

- Line 785: `it("renders Adaptive Follow-Through tab and displays ranked recommendations with priority scores", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:785`

- Line 804: `it("triggers feedback mutation when clicking Prioritize button", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:804`

- Line 822: `it("triggers dismissal mutation when clicking Dismiss button", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:822`

- Line 840: `it("adjusts focus domain multiplier and saves preferences", async () => {`
  - Source: `client/src/pages/Tasks.test.tsx:840`

## `client/src/pages/Transactions.test.tsx`

- Line 175: `it("renders the transaction ledger with items", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:175`

- Line 184: `it("selects individual transactions and shows the batch actions bar", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:184`

- Line 207: `it("toggles select all visible transactions", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:207`

- Line 222: `it("executes batch categorization on selected transactions", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:222`

- Line 252: `it("executes batch deletion on selected transactions after confirmation", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:252`

- Line 277: `it("opens Split Transaction dialog and saves multi-category allocation", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:277`

- Line 326: `it("keeps split drafts open until confirmation, preserves failed saves, and retries", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:326`

- Line 349: `it("does not announce split clearing when the server rejects it", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:349`

- Line 359: `it("retains saved custom split categories in the editor", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:359`

- Line 365: `it("edits the original ledger value when the API returns a converted amount", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:365`

- Line 374: `it("uses original amounts for split and recurring actions instead of FX estimates", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:374`

- Line 387: `it("prevents editing a converted transaction when the original value is unavailable", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:387`

- Line 394: `it("renders split badge and toggles breakdown details for split transactions", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:394`

- Line 412: `it("clears split breakdown and restores unified category", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:412`

- Line 439: `it("opens Create Recurring Rule dialog and submits new rule for transaction", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:439`

- Line 492: `it("renders Multi-Currency FX Cockpit and switches currencies dynamically with deterministic FX rates", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:492`

- Line 516: `it("renders Automated Merchant Clustering Engine and applies 1-click normalization", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:516`

- Line 542: `it("opens Bank Connector Webhook Feed Simulator and simulates real-time transaction ingestion", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:542`

- Line 576: `it("sends the review filter to the server so pagination totals match the filtered list", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:576`

- Line 595: `it("does not accept a zero amount in the create form", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:595`

- Line 602: `it("scrolls the add/edit form into view and focuses the amount field when opened", async () => {`
  - Source: `client/src/pages/Transactions.test.tsx:602`

## `client/src/pages/Workflows.test.tsx`

- Line 103: `describe("Workflows Page", () => {`
  - Source: `client/src/pages/Workflows.test.tsx:103`

- Line 133: `it("renders workflows page with list of user workflows", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:133`

- Line 153: `it("renders webhook trigger badge, token preview, and allows copying webhook URL", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:153`

- Line 185: `it("triggers simulation and allows confirming workflow run", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:185`

- Line 221: `it("loads a shared ?template= link from the query string (wouter useSearch)", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:221`

- Line 242: `it("summarises what a workflow run produced after confirmation", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:242`

- Line 266: `it("triggers simulation for toggling workflow enabled/disabled status", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:266`

- Line 295: `it("switches to create tab and simulates creating a new workflow", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:295`

- Line 325: `it("allows adding and updating a conditional branch filter rule on an action", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:325`

- Line 369: `it("switches to templates tab and allows using a template", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:369`

- Line 395: `it("displays empty state when no workflows exist", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:395`

- Line 409: `it("renders visual pipeline ribbons on workflow cards in My Workflows", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:409`

- Line 428: `it("renders the interactive node pipeline flow canvas in the Create tab", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:428`

- Line 449: `it("adds a multi-step delay action via canvas quick add and configures duration and presets", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:449`

- Line 483: `it("reorders actions using visual canvas move buttons", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:483`

- Line 518: `it("simulates and creates a multi-step workflow with delay timer action", async () => {`
  - Source: `client/src/pages/Workflows.test.tsx:518`

## `client/src/services/aiStream.test.ts`

- Line 27: `it("sends cookie credentials, current org and CSRF token without consuming SSE response", async () => {`
  - Source: `client/src/services/aiStream.test.ts:27`

- Line 42: `it("fetches a token before sending if auth initialization has not completed", async () => {`
  - Source: `client/src/services/aiStream.test.ts:42`

- Line 52: `it("refreshes an expired CSRF token once and retries the current stream", async () => {`
  - Source: `client/src/services/aiStream.test.ts:52`

- Line 62: `it("does not retry a stream after the organization changes, even if it changes back", async () => {`
  - Source: `client/src/services/aiStream.test.ts:62`

- Line 73: `it("does not retry a stream after a different account signs in", async () => {`
  - Source: `client/src/services/aiStream.test.ts:73`

- Line 83: `it("does not replay after workspace changes while a CSRF refresh is pending", async () => {`
  - Source: `client/src/services/aiStream.test.ts:83`

- Line 94: `it("honors cancellation before retrying a rejected stream", async () => {`
  - Source: `client/src/services/aiStream.test.ts:94`

- Line 105: `it("passes unrelated failures back to the stream consumer without retrying", async () => {`
  - Source: `client/src/services/aiStream.test.ts:105`

## `client/src/services/errorReporting.test.ts`

- Line 9: `describe("browser error reports", () => {`
  - Source: `client/src/services/errorReporting.test.ts:9`

- Line 10: `it("keeps only safe app frames and sends one credential-free report per error", async () => {`
  - Source: `client/src/services/errorReporting.test.ts:10`

- Line 39: `it("returns no receipt on network failure, non-202 responses, or invalid receipts", async () => {`
  - Source: `client/src/services/errorReporting.test.ts:39`

## `client/src/stores/chatStore.test.ts`

- Line 46: `describe("chatStore", () => {`
  - Source: `client/src/stores/chatStore.test.ts:46`

- Line 65: `it("ignores a late session list after switching away and back to the same owner", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:65`

- Line 78: `it("does not let an old send overwrite messages or unlock a new owner's send", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:78`

- Line 91: `it("does not auto-send after a previous owner's session creation completes", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:91`

- Line 102: `describe("initial state", () => {`
  - Source: `client/src/stores/chatStore.test.ts:102`

- Line 103: `it("has empty sessions and messages", () => {`
  - Source: `client/src/stores/chatStore.test.ts:103`

- Line 110: `it("is not loading initially", () => {`
  - Source: `client/src/stores/chatStore.test.ts:110`

- Line 117: `it("has no workflow phase", () => {`
  - Source: `client/src/stores/chatStore.test.ts:117`

- Line 125: `describe("loadSessions", () => {`
  - Source: `client/src/stores/chatStore.test.ts:125`

- Line 126: `it("loads sessions from API", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:126`

- Line 134: `it("sets loading state during fetch", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:134`

- Line 142: `describe("createSession", () => {`
  - Source: `client/src/stores/chatStore.test.ts:142`

- Line 143: `it("creates a new session and adds to list", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:143`

- Line 153: `describe("selectSession", () => {`
  - Source: `client/src/stores/chatStore.test.ts:153`

- Line 154: `it("loads messages when a persisted session is already selected", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:154`

- Line 160: `it("does not request the same session twice while it loads", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:160`

- Line 167: `it("ignores an old message request after selecting a new conversation", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:167`

- Line 178: `it("loads messages for selected session", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:178`

- Line 186: `it("sets loading state during message fetch", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:186`

- Line 194: `it("keeps a late reply out of a different active conversation", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:194`

- Line 209: `it("keeps only the new assistant reply when regenerating an existing question", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:209`

- Line 225: `it("prevents duplicate sends while creating the first conversation", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:225`

- Line 233: `it("exposes a history failure and recovers when the same conversation is retried", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:233`

- Line 243: `it("does not show a stale loading error in another conversation", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:243`

- Line 253: `it("reports a failed send to the composer and removes only the optimistic message", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:253`

- Line 263: `it("does not report success when the first conversation cannot be created", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:263`

- Line 270: `describe("workflow phase", () => {`
  - Source: `client/src/stores/chatStore.test.ts:270`

- Line 271: `it("sets workflow phase", () => {`
  - Source: `client/src/stores/chatStore.test.ts:271`

- Line 278: `it("tracks phase history", () => {`
  - Source: `client/src/stores/chatStore.test.ts:278`

- Line 290: `it("clears workflow progress", () => {`
  - Source: `client/src/stores/chatStore.test.ts:290`

- Line 301: `describe("deleteSession", () => {`
  - Source: `client/src/stores/chatStore.test.ts:301`

- Line 302: `it("removes session from list", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:302`

- Line 314: `describe("renameSession", () => {`
  - Source: `client/src/stores/chatStore.test.ts:314`

- Line 315: `it("updates session title", async () => {`
  - Source: `client/src/stores/chatStore.test.ts:315`

## `client/src/stores/stores.test.ts`

- Line 6: `describe("aiStore", () => {`
  - Source: `client/src/stores/stores.test.ts:6`

- Line 11: `it("starts in idle phase", () => {`
  - Source: `client/src/stores/stores.test.ts:11`

- Line 17: `it("transitions through phases", () => {`
  - Source: `client/src/stores/stores.test.ts:17`

- Line 26: `it("pushes trace entries and tracks active agent", () => {`
  - Source: `client/src/stores/stores.test.ts:26`

- Line 41: `it("sets error state", () => {`
  - Source: `client/src/stores/stores.test.ts:41`

- Line 50: `it("resets to initial state", () => {`
  - Source: `client/src/stores/stores.test.ts:50`

- Line 69: `describe("orgStore", () => {`
  - Source: `client/src/stores/stores.test.ts:69`

- Line 74: `it("starts with null activeOrgId", () => {`
  - Source: `client/src/stores/stores.test.ts:74`

- Line 78: `it("sets active org", () => {`
  - Source: `client/src/stores/stores.test.ts:78`

- Line 83: `it("clears active org", () => {`
  - Source: `client/src/stores/stores.test.ts:83`

- Line 90: `describe("commandBarStore", () => {`
  - Source: `client/src/stores/stores.test.ts:90`

- Line 95: `it("starts closed with empty history", () => {`
  - Source: `client/src/stores/stores.test.ts:95`

- Line 101: `it("opens and closes", () => {`
  - Source: `client/src/stores/stores.test.ts:101`

- Line 109: `it("toggles", () => {`
  - Source: `client/src/stores/stores.test.ts:109`

- Line 117: `it("tracks command history with deduplication", () => {`
  - Source: `client/src/stores/stores.test.ts:117`

- Line 129: `it("limits history to 20 items", () => {`
  - Source: `client/src/stores/stores.test.ts:129`

## `client/src/test/features.test.ts`

- Line 6: `describe("useNotifications", () => {`
  - Source: `client/src/test/features.test.ts:6`

- Line 7: `it("should export hook functions", async () => {`
  - Source: `client/src/test/features.test.ts:7`

- Line 16: `describe("useKeyboardShortcuts", () => {`
  - Source: `client/src/test/features.test.ts:16`

- Line 17: `it("should export the hook", async () => {`
  - Source: `client/src/test/features.test.ts:17`

- Line 26: `describe("errorReporting", () => {`
  - Source: `client/src/test/features.test.ts:26`

- Line 27: `it("should expose install and report", async () => {`
  - Source: `client/src/test/features.test.ts:27`

- Line 33: `it("should not throw when install is called", async () => {`
  - Source: `client/src/test/features.test.ts:33`

- Line 41: `describe("API v1 modules", () => {`
  - Source: `client/src/test/features.test.ts:41`

- Line 42: `it("should export notifications API functions", async () => {`
  - Source: `client/src/test/features.test.ts:42`

- Line 49: `it("should export analytics API functions", async () => {`
  - Source: `client/src/test/features.test.ts:49`

- Line 58: `it("should export collaboration API functions", async () => {`
  - Source: `client/src/test/features.test.ts:58`

- Line 70: `describe("commandBarStore", () => {`
  - Source: `client/src/test/features.test.ts:70`

- Line 71: `it("should toggle open/close state", async () => {`
  - Source: `client/src/test/features.test.ts:71`

- Line 82: `it("should push history and deduplicate", async () => {`
  - Source: `client/src/test/features.test.ts:82`

