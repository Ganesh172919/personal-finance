# FinWise — Frontend Architecture

> Guide to the React client application architecture, routing, state management, and component system.

---

## Tech Stack

| Layer            | Technology                    | Version |
| ---------------- | ----------------------------- | ------- |
| Framework        | React                         | 18      |
| Build Tool       | Vite                          | 7.3     |
| Language         | TypeScript                    | 5+      |
| Routing          | Wouter                        | —       |
| State Management | Zustand                       | —       |
| Data Fetching    | React Query (TanStack)        | 5+      |
| Styling          | Tailwind CSS                  | —       |
| UI Components    | Radix UI (shadcn/ui-inspired) | —       |
| Forms            | React Hook Form + Zod         | —       |
| Charts           | Recharts                      | —       |
| Animations       | Framer Motion                 | —       |
| Icons            | Lucide React                  | —       |

---

## Directory Structure

```
client/src/
├── components/             # Reusable components
│   ├── ui/                 # 47 base UI primitives (Button, Card, Dialog, etc.)
│   ├── forms/              # Form-specific components
│   ├── Sidebar.tsx         # Navigation sidebar
│   ├── AiCommandBar.tsx    # AI command palette (⌘K)
│   ├── Dashboard.test.tsx  # Component tests
│   └── ... (30 feature components)
├── features/               # Feature modules
│   ├── chat/               # Chat UI components (8 files)
│   ├── journaling/         # Financial journaling
│   └── workflows/          # Workflow builder components
├── hooks/                  # Custom React hooks (13 files)
├── lib/                    # API layer & utilities
│   ├── api/                # 16 root + 15 v1 domain-specific API modules
│   ├── apiBase.ts          # Axios base configuration
│   ├── apiClient.ts        # Re-export entry point
│   ├── apiError.ts         # Error handling utilities
│   ├── orgContext.ts       # Organization context helper
│   ├── queryClient.ts      # React Query client config
│   ├── runtimeLogger.ts    # Client-side runtime logger
│   ├── url.ts              # URL utilities
│   └── utils.ts            # General utilities
├── pages/                  # Route-level page components (33 pages)
├── stores/                 # Zustand state stores (5 stores + test file)
├── types/                  # Shared TypeScript interfaces
├── App.tsx                 # Root app: providers + routing
├── main.tsx                # Vite entry point
└── index.css               # Global styles + Tailwind directives
```

---

## Routing Map

All routes are defined in `App.tsx` using **Wouter**. Protected routes are wrapped in `<ProtectedRoute>`, which redirects unauthenticated users to `/login`.

### Public Routes

| Path                            | Page                   | Description                           |
| ------------------------------- | ---------------------- | ------------------------------------- |
| `/login`                        | `Login`                | Email/password + Google OAuth sign-in |
| `/register`                     | `Register`             | New account registration              |
| `/verify-email`                 | `VerifyEmail`          | Email verification flow               |
| `/accept-invite`                | `AcceptInvite`         | Organization invite acceptance        |
| `/share/financial-story/:token` | `SharedFinancialStory` | Publicly shared financial story       |

### Protected Routes (with Sidebar)

| Path                    | Page                | Description                       |
| ----------------------- | ------------------- | --------------------------------- |
| `/dashboard`            | `Dashboard`         | Main dashboard with widgets       |
| `/transactions`         | `Transactions`      | Transaction list, search & filter |
| `/finance`              | `FinanceOS`         | Full finance management suite     |
| `/portfolio`            | `Portfolio`         | Investment portfolio overview     |
| `/goals-debts`          | `GoalsAndDebts`     | Goals tracking & debt management  |
| `/scenarios`            | `Scenarios`         | What-if financial scenarios       |
| `/financial-story`      | `FinancialStory`    | AI-generated financial narrative  |
| `/all-insights`         | `AllInsights`       | AI-powered financial insights     |
| `/tasks`                | `Tasks`             | AI-generated action items         |
| `/workflows`            | `Workflows`         | Automation workflows              |
| `/receipts`             | `Receipts`          | Receipt OCR & management          |
| `/notes`                | `Notes`             | Financial notes & journaling      |
| `/exports`              | `Exports`           | Data export history               |
| `/blogs`                | `Blogs`             | Financial education blog          |
| `/blogs/:slug`          | `BlogDetail`        | Individual blog post              |
| `/growth-stories`       | `GrowthStories`     | Financial growth stories          |
| `/growth-stories/:slug` | `GrowthStoryDetail` | Individual growth story           |
| `/billing`              | `Billing`           | Subscription & billing management |
| `/org`                  | `Organization`      | Organization settings & members   |
| `/onboarding`           | `Onboarding`        | New user onboarding wizard        |
| `/docs`                 | `Documentation`     | In-app documentation viewer       |
| `/settings`             | `Settings`          | User profile & account settings   |
| `/activity`             | `ActivityFeed`      | Organization activity stream      |
| `/calendar`             | `FinancialCalendar` | Calendar view of financial events |

### Chat Routes (Full-screen layout)

| Path               | Page       | Description                    |
| ------------------ | ---------- | ------------------------------ |
| `/chat`            | `ChatPage` | AI financial assistant chat    |
| `/chat/:sessionId` | `ChatPage` | Resume a specific chat session |

---

## State Management

### Zustand Stores

| Store               | File                 | Purpose                                  |
| ------------------- | -------------------- | ---------------------------------------- |
| **chatStore**       | `chatStore.ts`       | Chat sessions, messages, streaming state |
| **aiStore**         | `aiStore.ts`         | AI command bar state, pending actions    |
| **appDialogStore**  | `appDialogStore.ts`  | Global dialog/modal visibility state     |
| **commandBarStore** | `commandBarStore.ts` | Command palette (⌘K) open/close state    |
| **orgStore**        | `orgStore.ts`        | Active organization context              |

### React Query

React Query handles all server state. The query client is configured in `lib/queryClient.ts` with:

- Default stale time for cache invalidation
- Error retry configuration
- Background refetching on window focus

---

## Custom Hooks

| Hook                   | File                      | Purpose                                               |
| ---------------------- | ------------------------- | ----------------------------------------------------- |
| `useAuth`              | `useAuth.tsx`             | Authentication context (user, login, logout, loading) |
| `useAIStream`          | `useAIStream.ts`          | Server-Sent Events streaming for AI responses         |
| `useRealtimeEvents`    | `useRealtimeEvents.ts`    | SSE connection for real-time app events               |
| `useAppConfig`         | `useAppConfig.ts`         | Fetches public app configuration                      |
| `useOrgFormatters`     | `useOrgFormatters.ts`     | Currency & date formatting based on org settings      |
| `useDebounce`          | `useDebounce.ts`          | Debounced value hook                                  |
| `useToast`             | `useToast.tsx`            | Toast notification system                             |
| `useMobile`            | `use-mobile.ts`           | Responsive viewport detection                         |
| `useAccessibility`     | `useAccessibility.tsx`    | Accessibility helpers (ARIA, focus management)        |
| `useKeyboardShortcuts` | `useKeyboardShortcuts.ts` | Global keyboard shortcut registration                 |
| `useNotifications`     | `useNotifications.ts`     | Real-time notification subscription and management    |
| `useVirtualList`       | `useVirtualList.ts`       | Virtualized list rendering for large datasets         |

---

## API Client Layer

Located in `lib/api/`, one module per domain:

| Module            | Endpoints covered                     |
| ----------------- | ------------------------------------- |
| `auth.ts`         | Login, register, verify, Google OAuth |
| `core.ts`         | Profile, dashboard data               |
| `transactions.ts` | CRUD + search + pagination            |
| `ai.ts`           | Insights, scenarios, story generation |
| `chat.ts`         | Sessions & messages                   |
| `receipts.ts`     | Upload & OCR                          |
| `tasks.ts`        | Task CRUD & action application        |
| `billing.ts`      | Checkout, portal, usage               |
| `content.ts`      | Blogs & growth stories                |
| `journal.ts`      | Journal CRUD                          |
| `profile.ts`      | Financial profile                     |
| `config.ts`       | App config                            |
| `tools.ts`        | Tool simulation & execution           |
| `settings.ts`     | User settings & preferences           |

All modules use the shared `apiBase.ts` Axios instance with automatic JWT token attachment and error handling via `apiError.ts`.

### V1 API Client Modules (`lib/api/v1/`)

| Module             | Endpoints covered                          |
| ------------------ | ------------------------------------------ |
| `analytics.ts`     | Analytics overview and detail queries      |
| `apiKeys.ts`       | API key CRUD and revocation                |
| `autopilot.ts`     | Plan, simulate, approve, execute           |
| `collaboration.ts` | Activity feed, comments, annotations       |
| `exports.ts`       | Export creation, status, download          |
| `finance.ts`       | Accounts, merchants, budgets, recurring    |
| `invites.ts`       | Organization invite acceptance             |
| `notifications.ts` | Notification listing and read status       |
| `orgs.ts`          | Organization CRUD and settings             |
| `platform.ts`      | Marketplace, plugins, integrations, events |
| `referrals.ts`     | Referral codes and redemption              |
| `shares.ts`        | Public share links                         |
| `usage.ts`         | Usage ledger queries                       |
| `workflows.ts`     | Workflow CRUD and execution                |

---

## Component System

### UI Primitives (`components/ui/`)

47 base components following the **shadcn/ui** pattern — thin wrappers around Radix UI primitives with Tailwind styling:

`Accordion`, `AlertDialog`, `Avatar`, `Badge`, `Breadcrumb`, `Button`, `Calendar`, `Card`, `Carousel`, `Chart`, `Checkbox`, `Collapsible`, `Command`, `Dialog`, `Drawer`, `DropdownMenu`, `Form`, `Input`, `InputOtp`, `Label`, `Menubar`, `NavigationMenu`, `Pagination`, `Popover`, `Progress`, `RadioGroup`, `ResizablePanel`, `ScrollArea`, `Select`, `Separator`, `Sheet`, `Sidebar`, `Skeleton`, `Slider`, `Sonner`, `Switch`, `Table`, `Tabs`, `Textarea`, `Toast`, `Toaster`, `Toggle`, `ToggleGroup`, `Tooltip`, and more.

### Feature Components

| Component                      | Purpose                              |
| ------------------------------ | ------------------------------------ |
| `AiCommandBar`                 | Global AI command palette (⌘K)       |
| `ActionableInsights`           | Financial insight cards with actions |
| `SpendingAnalysis`             | Spending breakdown charts            |
| `FinancialVitals`              | Key financial metrics dashboard      |
| `GoalProgress`                 | Goal tracking with progress bars     |
| `InvestmentPortfolio`          | Portfolio allocation visualization   |
| `ScenarioWidget`               | What-if scenario builder             |
| `TasksWidget`                  | Actionable task list                 |
| `ReceiptOcrDialog`             | Receipt upload & OCR review          |
| `AgentWorkflowVisualizer`      | Visual workflow execution display    |
| `AiStatusDialog`               | AI Core status & health dialog       |
| `AppErrorBoundary`             | Global React error boundary          |
| `FeatureLimitDialog`           | Feature limit reached notification   |
| `PlanAndUsageDialog`           | Plan details & usage overview        |
| `QuickActions`                 | Dashboard quick action cards         |
| `RecentActivity`               | Recent activity feed widget          |
| `TaskApplyDialog`              | Task recommendation apply dialog     |
| `InsightDetailModal`           | Detailed AI insight view             |
| `GoalDetailModal`              | Financial goal detail view           |
| `ReadingProgressBar`           | Blog/story reading progress          |
| `FinancialTransformationChart` | Financial transformation timeline    |
| `CommentThread`                | Threaded comment discussion UI       |
| `NotificationCenter`           | Real-time notification panel         |
| `FinancialCopilot`             | AI copilot assistant widget          |
| `BlogCard`                     | Blog post preview card               |
| `GrowthStoryCard`              | Growth story preview card            |
| `LazyImage`                    | Progressive image loading component  |
| `Sidebar`                      | Main navigation sidebar              |

---

## Code Splitting

All page components are **lazy-loaded** via `React.lazy()` + `<Suspense>`, ensuring the initial bundle stays small:

```tsx
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const ChatPage = lazy(() => import("@/pages/ChatPage"));
const Settings = lazy(() => import("@/pages/Settings"));
// ... all 33 pages
```

---

## Theming

Theming is managed by `ThemeProvider.tsx`, which provides:

- **Dark / Light** mode toggle
- CSS custom properties for all design tokens
- System preference detection

---

_See also_: [ARCHITECTURE.md](./ARCHITECTURE.md) · [API.md](./API.md) · [CONTRIBUTING.md](./CONTRIBUTING.md)
