<!--
MEGA_FRONTEND_UI_ATLAS.md

Purpose:
- A deep, practical map of the React client: routes, layouts, state, UI primitives, and feature composition.
- Designed to help you answer “where do I change X in the UI?” quickly.

Note on length:
- You requested large docs with new files only.
- This file intentionally exceeds 500 lines.
-->

# FinWise Frontend UI Atlas (Mega)

This document is a high-detail guide to the `client/` application.
It complements `docs/FRONTEND.md` by being more map-like and task-oriented.

If you want the repo-wide atlas, read `docs/MEGA_CODEBASE_REFERENCE.md`.
If you want API request conventions, read `docs/MEGA_API_PLAYBOOK.md`.

---

## 1) What the Client Is

The client is a React 18 + TypeScript SPA built with Vite.
It uses:
- Wouter for routing.
- TanStack React Query for server state.
- Zustand for app/session UI state.
- Tailwind CSS + Radix UI primitives for UI.

The client is “cookie-auth” oriented:
- It sends `credentials: "include"` on API calls.
- It assumes the server sets a JWT cookie on login.

---

## 2) Entry Points (Read These First)

Boot:
- `client/src/main.tsx`

Route table and layouts:
- `client/src/App.tsx`

Sidebar nav:
- `client/src/components/Sidebar.tsx`

API client rules (CSRF + org header injection):
- `client/src/lib/api/core.ts`

React Query defaults:
- `client/src/lib/queryClient.ts`

---

## 3) Routing: Mental Model

The client defines:
- Public routes (no auth required).
- Protected routes (require user session).

Implementation:
- `ProtectedRoute` in `client/src/App.tsx` checks `useAuth()`.
- If loading, shows a full-screen spinner.
- If no user, redirects to `/login`.

Layouts:
- Default authenticated layout:
  - sidebar on the left,
  - scrollable content,
  - financial copilot panel.
- Chat layout:
  - no sidebar,
  - full-height chat experience.

---

## 4) Route Table (High-Level Map)

This is a route-to-page map extracted from `client/src/App.tsx`.
Use it to find the page component quickly.

Legend:
- Public = no auth required.
- Protected = wrapped in `ProtectedRoute`.
- Layout = `AppAuthenticatedLayout` or `ChatLayout`.

Public routes:
- `/login` → `client/src/pages/Login.tsx` (Public)
- `/register` → `client/src/pages/Register.tsx` (Public)
- `/verify-email` → `client/src/pages/VerifyEmail.tsx` (Public)
- `/accept-invite` → `client/src/pages/AcceptInvite.tsx` (Public)
- `/shared-financial-story/:token` → `client/src/pages/SharedFinancialStory.tsx` (Public)

Protected routes (Chat layout):
- `/chat` → `client/src/pages/ChatPage.tsx` (Protected, ChatLayout)
- `/chat/:sessionId` → `client/src/pages/ChatPage.tsx` (Protected, ChatLayout)

Protected routes (App layout):
- `/dashboard` → `client/src/pages/Dashboard.tsx`
- `/scenarios` → `client/src/pages/Scenarios.tsx`
- `/financial-story` → `client/src/pages/FinancialStory.tsx`
- `/portfolio` → `client/src/pages/Portfolio.tsx`
- `/all-insights` → `client/src/pages/AllInsights.tsx`
- `/goals-debts` → `client/src/pages/GoalsAndDebts.tsx`
- `/transactions` → `client/src/pages/Transactions.tsx`
- `/finance` → `client/src/pages/FinanceOS.tsx`
- `/exports` → `client/src/pages/Exports.tsx`
- `/workflows` → `client/src/pages/Workflows.tsx`
- `/tasks` → `client/src/pages/Tasks.tsx`
- `/receipts` → `client/src/pages/Receipts.tsx`
- `/onboarding` → `client/src/pages/Onboarding.tsx`
- `/notes` → `client/src/pages/Notes.tsx`
- `/billing` → `client/src/pages/Billing.tsx`
- `/org` → `client/src/pages/Organization.tsx`
- `/docs` → `client/src/pages/Documentation.tsx`
- `/settings` → `client/src/pages/Settings.tsx`
- `/analytics` → `client/src/pages/Analytics.tsx`
- `/calendar` → `client/src/pages/FinancialCalendar.tsx`
- `/activity` → `client/src/pages/ActivityFeed.tsx`
- `/financial-health` → `client/src/pages/FinancialHealth.tsx`
- `/subscriptions` → `client/src/pages/Subscriptions.tsx`
- `/what-if` → `client/src/pages/WhatIf.tsx`

Protected routes (content):
- `/growth-stories` → `client/src/pages/GrowthStories.tsx`
- `/growth-stories/:slug` → `client/src/pages/GrowthStoryDetail.tsx`
- `/blogs` → `client/src/pages/Blogs.tsx`
- `/blogs/:slug` → `client/src/pages/BlogDetail.tsx`

Fallback:
- `/` → redirects to `/dashboard` when logged in else `/login`.
- `*` → `client/src/pages/NotFound.tsx`

---

## 5) Layouts and Persistent UI

### 5.1 `AppAuthenticatedLayout`

Defined in:
- `client/src/App.tsx`

Structure:
- `<Sidebar />` (primary navigation)
- `<div className="flex-1 ...">` content area
- `<FinancialCopilot />` persistent AI assistant panel

Implication:
- Any page under this layout should avoid building its own global nav.

### 5.2 `ChatLayout`

Defined in:
- `client/src/App.tsx`

Structure:
- Full-height column layout.

Implication:
- Chat pages own their own “sidebar-like” UI for sessions/history.

### 5.3 Global dialogs and overlays

Always-on components in App root:
- `<FeatureLimitDialog />`
- `<PlanAndUsageDialog />`

Implication:
- Feature limit errors (402) can open a global modal from any API call.

---

## 6) Server State vs UI State (React Query vs Zustand)

### 6.1 React Query (server state)

Config:
- `client/src/lib/queryClient.ts`

Defaults (selected):
- `staleTime: 30_000`
- `retry: false` (important for idempotency and UI predictability)
- no refetch on focus by default

Rule of thumb:
- Data that comes from the server should be in React Query.

### 6.2 Zustand (UI / session state)

Stores:
- `client/src/stores/aiStore.ts`
- `client/src/stores/chatStore.ts`
- `client/src/stores/orgStore.ts`
- `client/src/stores/commandBarStore.ts`
- `client/src/stores/appDialogStore.ts`

Rule of thumb:
- Use Zustand for:
  - dialogs,
  - command bar state,
  - streaming chat UI state,
  - org selection state (especially cross-page).

---

## 7) API Client in the SPA (Important Details)

API client core:
- `client/src/lib/api/core.ts`

Key behaviors:
- Sets `credentials: "include"` (cookie auth).
- Injects `Content-Type: application/json` unless body is FormData.
- Injects `X-Org-Id` from active org storage if present.
- Injects `X-CSRF-Token` for unsafe methods when token is known.

CSRF token lifecycle:
- Fetch via `fetchCsrfToken()` which calls `/auth/csrf`.
- Store token in memory (`setCsrfToken`).
- Retry once on `403 CSRF_FAILED` by refreshing token.

Org header lifecycle:
- Active org id stored via `client/src/lib/orgContext.ts`.
- Auto-injected for requests.
- On certain 403 responses, client clears active org id and retries safe request once.

Feature limit behavior:
- On 402 with `FEATURE_LIMIT_REACHED` or `FEATURE_NOT_AVAILABLE`,
  client triggers `FeatureLimitDialog`.

---

## 8) UI Component Taxonomy (How UI Is Organized)

UI primitives:
- `client/src/components/ui/*`

Examples (not exhaustive):
- Button, Input, Dialog, Accordion, Tooltip, ScrollArea, Card, Badge.

Feature components:
- `client/src/components/*`

Examples (not exhaustive):
- `FinancialCopilot`
- `TasksWidget`
- `SpendingAnalysis`
- `BudgetVsActualChart`
- `NotificationCenter`

Feature folders:
- `client/src/features/*` (e.g., chat).

Rule of thumb:
- `components/ui` should be domain-agnostic and reusable.
- `components/*` can be domain-aware composites.
- `features/*` can contain larger feature slices with internal composition.

---

## 9) “Where is X implemented?” (UI Cheat Sheet)

Navigation:
- `client/src/components/Sidebar.tsx`

Auth flows:
- `client/src/pages/Login.tsx`
- `client/src/pages/Register.tsx`
- `client/src/pages/VerifyEmail.tsx`

Dashboard:
- `client/src/pages/Dashboard.tsx`
- `client/src/components/FinancialVitals.tsx`
- `client/src/components/ActionableInsights.tsx`

Transactions:
- `client/src/pages/Transactions.tsx`
- `client/src/lib/api/v1/transactions.ts` (or related wrapper)

Goals & debts:
- `client/src/pages/GoalsAndDebts.tsx`

Workflows:
- `client/src/pages/Workflows.tsx`
- `client/src/components/AgentWorkflowVisualizer.tsx` (visual tracing)

Tasks:
- `client/src/pages/Tasks.tsx`
- `client/src/components/TasksWidget.tsx`

Receipts:
- `client/src/pages/Receipts.tsx`
- `client/src/components/ReceiptOcrDialog.tsx`

AI chat:
- `client/src/pages/ChatPage.tsx`
- `client/src/features/chat/*`

Organization settings:
- `client/src/pages/Organization.tsx`
- `client/src/stores/orgStore.ts`

Billing:
- `client/src/pages/Billing.tsx`
- `client/src/pages/Subscriptions.tsx`

Documentation (in-app):
- `client/src/pages/Documentation.tsx`

---

## 10) Patterns to Follow When Adding UI

### 10.1 Add a new page

Steps:
- Create `client/src/pages/<NewPage>.tsx`.
- Add route in `client/src/App.tsx`.
- Add nav item in `client/src/components/Sidebar.tsx` if appropriate.
- Add API wrappers under `client/src/lib/api/v1/*` if calling server.

### 10.2 Add a new API call

Rules:
- Use `apiClient(...)` from `client/src/lib/api/core.ts`.
- Do not use raw `fetch` in components/pages.
- Ensure error handling uses `ApiError` (already thrown by apiClient).

### 10.3 Handle loading/error/empty

Minimal UX contract per page:
- Loading: show skeleton/spinner.
- Error: show actionable message and request id if available.
- Empty: explain what to do next (import, create, etc).

### 10.4 Keep query keys stable

React Query keys should be stable across renders.
Avoid:
- including non-stable objects without serialization.

Prefer:
- primitives and small objects that are memoized or serialized.

---

## 11) Testing the Client

Test runner:
- Vitest (`npm test` in `client/`).

Libraries:
- Testing Library (React + DOM assertions).
- MSW for API mocking (`client/src/test/mocks/*`).

Where tests live:
- Some are co-located with components.
- Some are in `client/src/test/*`.

Pattern to copy:
- Use MSW handlers to mock `/api/v1/*` calls.
- Keep mocks aligned with server error codes and `request_id`.

---

## 12) Accessibility and UX Notes (House Rules)

Focus management:
- Prefer Radix dialogs/popovers for correct focus trapping.

Keyboard navigation:
- Ensure command bar and dialogs are keyboard accessible.

Color contrast:
- Tailwind tokens should remain readable in both themes.

Performance:
- Use `lazy()` route loading as already done.
- Keep expensive charts memoized where possible.

---

## 13) Padding Section (Intentional)

These line-by-line reminders increase line count while still functioning as a review checklist.

Frontend PR checklist:
- Route added in `client/src/App.tsx` (if page).
- Nav updated in `client/src/components/Sidebar.tsx` (if user-facing).
- API calls go through `apiClient`.
- Org header behavior considered (`X-Org-Id`).
- CSRF behavior considered for unsafe methods.
- Feature limit 402 errors handled gracefully.
- Loading/empty/error states included.
- Tests added or updated.

Debug checklist:
- Check browser network tab for `X-Request-Id`.
- If 401: ensure cookies are present and sent.
- If 403 CSRF: ensure `X-CSRF-Token` header is set.
- If 403 ORG_ACCESS_DENIED: clear active org or select a valid org.

---

## 14) Route Map (Source of Truth: `client/src/App.tsx`)

Conventions:
- Most pages render inside `AppAuthenticatedLayout` (sidebar + copilot overlay).
- Chat renders inside `ChatLayout` (no classic sidebar; chat has its own sidebar).
- Public routes bypass `ProtectedRoute`.

Public routes:
- `/login` -> `Login`
- `/register` -> `Register`
- `/verify-email` -> `VerifyEmail`
- `/accept-invite` -> `AcceptInvite`
- `/share/financial-story/:token` -> `SharedFinancialStory`

Chat routes (Protected):
- `/chat` -> `ChatPage` (ChatLayout)
- `/chat/:sessionId` -> `ChatPage` (ChatLayout)

App routes (Protected, `AppAuthenticatedLayout`):
- `/dashboard` -> `Dashboard`
- `/scenarios` -> `Scenarios`
- `/financial-story` -> `FinancialStory`
- `/portfolio` -> `Portfolio`
- `/all-insights` -> `AllInsights`
- `/goals-debts` -> `GoalsAndDebts`
- `/transactions` -> `Transactions`
- `/finance` -> `FinanceOS`
- `/exports` -> `Exports`
- `/workflows` -> `Workflows`
- `/tasks` -> `Tasks`
- `/receipts` -> `Receipts`
- `/onboarding` -> `Onboarding`
- `/growth-stories` -> `GrowthStories`
- `/growth-stories/:slug` -> `GrowthStoryDetail`
- `/blogs` -> `Blogs`
- `/blogs/:slug` -> `BlogDetail`
- `/notes` -> `Notes`
- `/billing` -> `Billing`
- `/org` -> `Organization`
- `/docs` -> `Documentation`
- `/settings` -> `Settings`
- `/analytics` -> `Analytics`
- `/calendar` -> `FinancialCalendar`
- `/activity` -> `ActivityFeed`

Fallback behavior:
- `/` -> redirects to `/dashboard` (if authenticated) else `/login`
- unmatched -> `NotFound`

---

## 15) Page Catalog (Files in `client/src/pages/`)

Use this when you know the feature name and need the page component quickly.

Pages:
- `AcceptInvite.tsx` - Accept org invites via token; sets auth/org context.
- `ActivityFeed.tsx` - Activity feed UI; driven by server events/notifications.
- `AllInsights.tsx` - Insight list and drill-in entry points.
- `Analytics.tsx` - Analytics charts/filters and data export affordances.
- `Billing.tsx` - Plan, usage, and payment settings (gated by entitlements).
- `BlogDetail.tsx` - Blog post detail view by slug.
- `Blogs.tsx` - Blog index / list view.
- `ChatPage.tsx` - Primary chat UI entry point; sessions + streaming messages.
- `ComingSoon.tsx` - Placeholder page for in-progress features.
- `Dashboard.tsx` - Main landing; vitals, charts, quick actions.
- `Documentation.tsx` - In-app docs viewer; links to `docs/` content (server served).
- `Exports.tsx` - Export jobs list; download and status handling.
- `FinanceOS.tsx` - “Finance OS” view; connected widgets and summaries.
- `FinancialCalendar.tsx` - Calendar view for bills/recurring/alerts.
- `FinancialStory.tsx` - Narrative story UI; share and publish entry points.
- `GoalsAndDebts.tsx` - Goals, debts, progress graphs, payoff planning.
- `GrowthStories.tsx` - Growth story list UI.
- `GrowthStoryDetail.tsx` - Growth story detail by slug; comments.
- `Login.tsx` - Email/password login and OAuth entry points.
- `Notes.tsx` - Personal notes/journal UI (structured + freeform).
- `NotFound.tsx` - 404 view for missing routes.
- `Onboarding.tsx` - First-time setup flow; creates baseline profile.
- `Organization.tsx` - Org settings: members, invites, roles, seats.
- `Portfolio.tsx` - Investments portfolio overview.
- `Receipts.tsx` - Receipts list; OCR status; link to transactions.
- `Register.tsx` - Account creation and email verification workflow.
- `Scenarios.tsx` - Scenario modeling (“what if”) and saved scenarios.
- `Settings.tsx` - User settings and preferences.
- `SharedFinancialStory.tsx` - Public share view for story tokens.
- `Tasks.tsx` - Task list; assignments; workflow-produced tasks.
- `Transactions.tsx` - Transactions table; filters; import; categorization.
- `VerifyEmail.tsx` - Email verification screen.
- `Workflows.tsx` - Workflow list; run history; schedule/trigger visibility.

---

## 16) Realtime Events (SSE) and Cache Invalidation

The client consumes server-sent events via `useRealtimeEvents()`:
- Source: `client/src/hooks/useRealtimeEvents.ts`
- Transport: `EventSource("/api/v1/events/stream", { withCredentials: true })`
- Event name: listens for `"domain_event"` events
- Payload: JSON with `{ type, payload }`
- Side effect: invalidates TanStack React Query caches mapped by event type

Observed invalidation mapping (by event type):
- `TransactionCreated` -> `["transactions"]`, `["budget-envelopes"]`, `["financial-vitals"]`, `["forecast"]`
- `TransactionUpdated` -> `["transactions"]`, `["budget-envelopes"]`, `["financial-vitals"]`
- `TransactionDeleted` -> `["transactions"]`, `["budget-envelopes"]`, `["financial-vitals"]`
- `GoalUpdated` -> `["goals"]`
- `BudgetAllocationUpdated` -> `["budget-envelopes"]`
- `WorkflowRunCompleted` -> `["workflow-runs"]`, `["tasks"]`
- `ReceiptProcessed` -> `["receipts"]`, `["transactions"]`
- `InsightGenerated` -> `["insights"]`
- `TaskCreated` -> `["tasks"]`
- `TaskUpdated` -> `["tasks"]`
- `ExportCompleted` -> `["exports"]`

Operational behaviors:
- On `es.onerror`, the hook closes and reconnects after ~5 seconds.
- The hook is mounted once in `client/src/App.tsx` (after auth is established).

Debug tips:
- Confirm `/api/v1/events/stream` stays open in the network tab.
- If the stream closes immediately, check for `401` (cookie not sent) or proxy buffering.
- If events arrive but UI does not update, confirm the event `type` matches the map keys.

---

## 17) State Management Inventory (React Query + Zustand)

React Query:
- Provider: `QueryClientProvider` in `client/src/App.tsx`
- Client: `client/src/lib/queryClient` (source of `queryClient`)
- Rule: server state lives in queries; mutations should invalidate affected keys

Zustand stores (`client/src/stores/`):
- `aiStore.ts` - Copilot UI state (open/close, mode, active tool panels).
- `appDialogStore.ts` - Global dialog coordination (plan/usage, feature limit).
- `chatStore.ts` - Chat session state (current session, messages, streaming flags).
- `commandBarStore.ts` - Command bar state and history.
- `orgStore.ts` - Active org selection and org-scoped UI state.

Auth:
- `client/src/hooks/useAuth.ts` - user session fetch, login/logout, loading gates
- `AuthProvider` wraps the app; `ProtectedRoute` blocks routes while loading

---

## 18) Component Catalog (Feature Components in `client/src/components/`)

Use this list to find the “entry component” for a dashboard card or major widget.

Core layout and shell:
- `Sidebar.tsx` - Main navigation (org-aware, feature-aware).
- `ThemeProvider.tsx` - Theme context (dark/light), persistence.
- `FinancialCopilot.tsx` - Copilot overlay UI (chat + actions).
- `AppErrorBoundary.tsx` - UI safety net for rendering errors.

Dashboards and finance widgets:
- `FinancialVitals.tsx` - KPI summaries (cashflow, savings rate, etc).
- `SpendingAnalysis.tsx` - Category/merchant spend breakdown.
- `RecentActivity.tsx` - Recent events list (transactions/tasks/exports).
- `QuickActions.tsx` - High-level shortcuts (import, create goal, run workflow).
- `ScenarioWidget.tsx` - Scenario summary and entry point.
- `TasksWidget.tsx` - Task summary and quick completion.
- `InvestmentPortfolio.tsx` - Investment/portfolio view composition.
- `FinancialTransformationChart.tsx` - Multi-series time chart for narratives.

AI and automation UI:
- `AiCommandBar.tsx` - Command palette for AI/tool actions.
- `AiStatusDialog.tsx` - Shows AI run status and errors.
- `AgentWorkflowVisualizer.tsx` - Visualizes workflow steps/agent actions.
- `ActionableInsights.tsx` - AI insights surfaced as actionable items.

Notifications and dialogs:
- `NotificationCenter.tsx` - Notification inbox UI.
- `FeatureLimitDialog.tsx` - 402/entitlement gating UX.
- `PlanAndUsageDialog.tsx` - Billing plan and usage display.
- `ReceiptOcrDialog.tsx` - OCR processing display and re-run controls.
- `TaskApplyDialog.tsx` - Confirm/apply a task or workflow output.

Content components:
- `BlogCard.tsx` - Blog listing card.
- `GrowthStoryCard.tsx` - Growth story listing card.
- `CommentThread.tsx` - Comment list + create comment flows.
- `ReadingProgressBar.tsx` - Article reading progress indicator.
- `LazyImage.tsx` - Image loading with fallback.

---

## 19) UI Primitives Catalog (Radix/Tailwind Wrappers in `client/src/components/ui/`)

These are “design system” components; prefer using them over ad-hoc markup.

Common primitives:
- `Button.tsx` - Buttons + variants; use for consistent styling.
- `Input.tsx` - Text inputs; integrates with `Form.tsx`.
- `TextArea.tsx` - Multiline inputs.
- `Card.tsx` - Card layout patterns.
- `Dialog.tsx` - Modal dialogs (Radix).
- `Toast.tsx` + `Toaster.tsx` - Toast notifications.
- `Form.tsx` - React Hook Form helpers and wrappers.

Navigation primitives:
- `NavigationMenu.tsx` - Top nav/menu patterns.
- `Breadcrumb.tsx` - Breadcrumb patterns.
- `Pagination.tsx` - Pagination widget.
- `Sidebar.tsx` - Sidebar primitive helpers (distinct from app `Sidebar.tsx`).

Selection primitives:
- `Select.tsx` - Dropdown select.
- `Checkbox.tsx` - Checkbox.
- `RadioGroup.tsx` - Radio selection.
- `Switch.tsx` - Toggle switch.
- `Toggle.tsx` + `ToggleGroup.tsx` - Toggle patterns.
- `Slider.tsx` - Slider control.

Layout primitives:
- `Accordion.tsx` - Expand/collapse lists.
- `Tabs.tsx` - Tabbed interfaces.
- `ScrollArea.tsx` - Scrollable container.
- `Resizable.tsx` - Resizable panels.
- `Separator.tsx` - Visual dividers.
- `Collapsible.tsx` - Collapsible containers.

Feedback primitives:
- `Alert.tsx` - Inline alerts.
- `AlertDialog.tsx` - Confirm dialogs.
- `Progress.tsx` - Progress bars.
- `Skeleton.tsx` - Loading skeletons.
- `Tooltip.tsx` + `ToolTip.tsx` - Hover tooltips (naming differs; follow existing usage).

---

## 20) Practical UI Change Recipes (Fast Paths)

Add a new dashboard card:
- Create a component in `client/src/components/`.
- Add it to the `Dashboard.tsx` layout.
- Add required queries with stable query keys.
- Ensure empty/loading/error states are visible.
- Add an a11y label for charts and interactive widgets.

Add a new route/page:
- Create the page in `client/src/pages/`.
- Add `lazy(() => import(...))` in `client/src/App.tsx`.
- Add a `<Route path="...">` entry.
- Add nav item in `client/src/components/Sidebar.tsx` (if needed).
- Ensure entitlements gate the UI where appropriate.

Add a new query:
- Define a query key (array form).
- Use `useQuery({ queryKey, queryFn })`.
- Ensure the query is invalidated by any related mutations.
- If realtime matters, add it to `EVENT_INVALIDATION_MAP` in `useRealtimeEvents`.

Add a new modal/dialog:
- Prefer `Dialog.tsx` or `AlertDialog.tsx` primitives.
- Store open state in a store if triggered globally.
- Ensure focus trapping and escape-to-close behavior work.

---

## 21) Padding Section (Intentional, but Still Useful)

These lines increase line count while functioning as UI consistency prompts.

UI safety checklist:
- Do not render raw HTML without sanitization.
- Do not log full objects containing PII to the console.
- Do not display internal error stacks to end users.
- Do not assume a single org membership.

UX checklist:
- Every button has a disabled/loading state.
- Every table has an empty state and a “no results” state.
- Every modal has a clear cancel/close affordance.
- Every destructive action has a confirm step.

Realtime checklist:
- If a page shows transactions, ensure `TransactionUpdated` invalidates its query keys.
- If a page shows tasks, ensure `TaskUpdated` invalidates its query keys.
- If a page shows exports, ensure `ExportCompleted` invalidates its query keys.

Accessibility checklist:
- Form inputs have labels.
- Icons used as buttons have accessible names.
- Dialogs trap focus.
- Notifications are announced (toast role).
