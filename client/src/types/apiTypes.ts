/**
 * @fileoverview API Response Type Definitions
 *
 * TypeScript types for all API request and response shapes. These types
 * use an intersection pattern (`AnyRecord & { ... }`) to allow additional
 * fields from the server while providing type safety for known fields.
 *
 * WHY AnyRecord INTERSECTION?
 * The server may add fields over time. Using `AnyRecord & { known_fields }`
 * provides autocomplete for known fields while accepting unknown ones,
 * preventing breaking changes when the server evolves.
 *
 * CATEGORIES:
 * - Auth: login, logout, user profile
 * - Billing: checkout, portal, plans, entitlements
 * - API Keys: CRUD operations for programmatic access
 * - Exports: async export job management
 * - Orgs: multi-tenant organization management
 * - Workflows: automation workflow CRUD
 * - Content: blogs, growth stories
 *
 * @module types/apiTypes
 */

// Generic record dictionary supporting arbitrary key-value mapping structures.
// Provides open-ended typing to permit backward-compatible API response extension.
// Intersected with known domain models to safely absorb server additions.
type AnyRecord = { [key: string]: any };

// Encapsulates authentication session response payloads for logged-in accounts.
// Carries active user profile attributes, credentials, and request tracing IDs.
// Validates identity boundaries across secured client application views.
export type AuthUserResponse = AnyRecord & { request_id?: string };
export type LogoutResponse = AnyRecord & { request_id?: string };

// Defines parameters for initiating subscription checkout flows with payment providers.
// Specifies chosen subscription tier, billing period, seat allocations, and redirect URLs.
// Directs users toward external payment gateways to complete account upgrades.
export type BillingCheckoutRequest = AnyRecord & {
  plan_tier?: string;
  billing_cycle?: "monthly" | "annual";
  seats?: number;
  success_url?: string;
  cancel_url?: string;
};
export type BillingCheckoutResponse = AnyRecord & { url?: string; request_id?: string };
export type BillingPortalResponse = AnyRecord & { url?: string; request_id?: string };

// Structures one-off top-up requests for specialized AI or scenario usage credits.
// Specifies the predefined credit pack identifier targeted for user account purchase.
// Triggers transactional billing flows to allocate immediate feature capacities.
export type PurchaseCreditsRequest = {
  pack_id: "ai_pack_250" | "ocr_pack_100" | "scenarios_pack_100" | "flex_bundle";
};

// Conveys confirmation and receipt details following a successful credit purchase.
// Returns the activated pack profile, granted credit allocations, and audit IDs.
// Refreshes client-side balance counters to reflect updated computational allowances.
export type PurchaseCreditsResponse = {
  success: boolean;
  pack: {
    id: string;
    name: string;
    price_usd: number;
    credits: Record<string, number>;
  };
  period_key: string;
  purchase_id: string;
  request_id?: string;
};

// Models subscription tier pricing structures, feature limits, and entitlements.
// Represents individual feature quotas and complete catalog payloads from billing endpoints.
// Informs pricing matrices, upgrade modals, and client-side capability gates.
export type PlanLimit = AnyRecord & { key?: string; value?: number | null };
export type PlansResponse = AnyRecord & { plans?: AnyRecord[]; request_id?: string };
export type EntitlementsMeResponse = AnyRecord & { request_id?: string };
export type AppConfigResponse = AnyRecord & { request_id?: string };

// Represents developer API credentials and programmatic access token management.
// Encompasses permission scopes, key metadata rows, generation payloads, and revocations.
// Facilitates secure client-side configuration of external developer integrations.
export type ApiKeyScope = string;
export type ApiKeyRow = AnyRecord & {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  last_used_at?: string | null;
  revoked_at?: string | null;
};
export type CreateApiKeyRequest = AnyRecord & { name: string; scopes: ApiKeyScope[] };
export type CreateApiKeyResponse = AnyRecord & { api_key: string; request_id?: string };
export type ListApiKeysResponse = AnyRecord & { api_keys: ApiKeyRow[]; request_id?: string };
export type RevokeApiKeyResponse = AnyRecord & { revoked?: boolean; request_id?: string };

// Models background data export job lifecycles, states, and retrieval payloads.
// Tracks asynchronous generation progress across CSV, PDF, and archive export jobs.
// Provides polling endpoints the status metadata required for download delivery.
export type ExportJobStatus = "queued" | "running" | "succeeded" | "failed" | string;
export type ExportJobType = string;
export type ExportJob = AnyRecord & {
  id: string;
  status: ExportJobStatus;
  type: ExportJobType;
  created_at?: string;
  filename?: string | null;
  bytes?: number | null;
  error?: string | null;
};
export type CreateExportRequest = AnyRecord & { type: ExportJobType; params?: AnyRecord };
export type CreateExportResponse = AnyRecord & { queued?: boolean; job?: ExportJob; request_id?: string };
export type ListExportsResponse = AnyRecord & { exports: ExportJob[]; request_id?: string };
export type GetExportResponse = AnyRecord & { job?: ExportJob; request_id?: string };

// Defines payloads for interacting with automated finance autopilot runs.
// Handles run approval actions, state queries, and automated plan execution loops.
// Facilitates user confirmation when autonomous agents propose financial mutations.
export type AutopilotPlanRequest = AnyRecord;
export type AutopilotRunIdRequest = AnyRecord & { run_id?: string };
export type AutopilotApproveRequest = AnyRecord & { run_id?: string };
export type AutopilotRunResponse = AnyRecord & {
  run: AnyRecord & { id: string; status?: string };
  request_id?: string;
};

// Models multi-tenant organization structures, roles, and invitation handling.
// Captures organization profile summaries, seat allocations, and localized settings.
// Powers team workspace management, role assignments, and tenant switching.
export type AcceptOrgInviteResponse = AnyRecord & { accepted?: boolean; request_id?: string };

export type OrgRole = "owner" | "admin" | "member" | string;
export type OrgSummary = AnyRecord & {
  id: string;
  name: string;
  slug?: string;
  type?: string;
  plan_tier?: string;
  currency?: string;
  locale?: string;
  timezone?: string;
  role?: OrgRole;
  is_default?: boolean;
};
export type OrgsMeResponse = AnyRecord & {
  active_org?: OrgSummary | null;
  orgs: OrgSummary[];
  request_id?: string;
};
export type CreateOrgRequest = AnyRecord & { name: string; slug?: string };
export type CreateOrgResponse = AnyRecord & { org?: OrgSummary; request_id?: string };
export type AddOrgMemberRequest = AnyRecord & { email: string; role?: OrgRole };
export type AddOrgMemberResponse = AnyRecord & { request_id?: string };
export type UpdateOrgSettingsRequest = AnyRecord & {
  currency?: string;
  locale?: string;
  timezone?: string;
};
export type UpdateOrgSettingsResponse = AnyRecord & { request_id?: string };

// Conveys aggregated telemetry and event catalog entries for system automations.
// Delivers analytics overview rollups and supported automation event manifests.
// Powers monitoring dashboards and custom automation rule configuration screens.
export type AnalyticsOverviewResponse = AnyRecord & { request_id?: string };
export type AutomationEventEmitRequest = AnyRecord;
export type AutomationEventEmitResponse = AnyRecord & { accepted?: boolean; request_id?: string };
export type AutomationEventsCatalogResponse = AnyRecord & { events?: AnyRecord[]; request_id?: string };

// Manages system feature flag definitions, toggles, and rollout configurations.
// Enables dynamic runtime enablement of preview features and platform capabilities.
// Supplies administrative interfaces the tools to inspect and modify toggle states.
export type FeatureFlagDeleteResponse = AnyRecord & { request_id?: string };
export type FeatureFlagUpsertRequest = AnyRecord;
export type FeatureFlagUpsertResponse = AnyRecord & { request_id?: string };
export type FeatureFlagsListResponse = AnyRecord & { flags?: AnyRecord[]; request_id?: string };

// Structures synchronization commands and connection histories for external providers.
// Manages active connector registrations, sync job execution, and historical audit logs.
// Provides status indicators for bank links, third-party accounting, and data syncs.
export type IntegrationSyncRequest = AnyRecord;
export type IntegrationSyncResponse = AnyRecord & {
  run?: AnyRecord & { id?: string; status?: string };
  request_id?: string;
};
export type IntegrationHistoryResponse = AnyRecord & { history: AnyRecord[]; request_id?: string };
export type IntegrationsListResponse = AnyRecord & { connectors: AnyRecord[]; request_id?: string };

// Governs plugin marketplace interactions, installation commands, and catalog queries.
// Encapsulates extension package metadata, installed runtime states, and operations.
// Enables modular extension discovery and lifecycle management across workspaces.
export type MarketplaceInstallRequest = AnyRecord & { plugin_key: string; version?: string };
export type MarketplaceInstallResponse = AnyRecord & { install?: AnyRecord; request_id?: string };
export type MarketplaceCatalogResponse = AnyRecord & { plugins: AnyRecord[]; request_id?: string };
export type PluginOperationResponse = AnyRecord & { plugin?: AnyRecord; request_id?: string };
export type PluginsListResponse = AnyRecord & { plugins: AnyRecord[]; request_id?: string };

// Handles referral reward program interactions and redemption verification requests.
// Delivers reward balances, referral code histories, and claim transaction summaries.
// Drives growth marketing reward programs and user referral status displays.
export type ReferralRedeemRequest = AnyRecord;
export type ReferralRedeemResponse = AnyRecord & { request_id?: string };
export type ReferralsMeResponse = AnyRecord & { request_id?: string };

// Details granular consumption accounting across AI tokens, OCR pages, and features.
// Breaks down cost attribution, consumed units, and computational resource billing.
// Supplies users and administrators transparent accounting of resource expenditure.
export type UsageLedgerRow = AnyRecord & {
  feature: string;
  units: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
};
export type UsageLedgerResponse = AnyRecord & { ledger: UsageLedgerRow[]; period_key?: string; request_id?: string };

// Defines event, cron, manual, and webhook triggers for automated workflows.
// Specifies the initiating conditions that cause automation sequences to fire.
// Enforces valid trigger payload configurations within workflow creation editors.
export type TaskPriority = "low" | "medium" | "high" | string;
export type TaskKind = "cashflow" | "budget" | "debt" | "invest" | "goal" | "education" | "generic" | string;

export type WorkflowTriggerManual = AnyRecord & { type: "manual" };
export type WorkflowTriggerCron = AnyRecord & { type: "cron"; cron: string };
export type WorkflowTriggerEvent = AnyRecord & { type: "event"; event_type: string };
export type WorkflowTriggerWebhook = AnyRecord & { type: "webhook"; webhook_token?: string };
export type WorkflowTrigger =
  | WorkflowTriggerManual
  | WorkflowTriggerCron
  | WorkflowTriggerEvent
  | WorkflowTriggerWebhook
  | (AnyRecord & { type: string });

// Outlines configurable action steps and conditional filters executed by workflows.
// Supports task generation, notification dispatches, report exports, and delays.
// Validates step definitions and evaluation rules within automation orchestration.
export type WorkflowConditionOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains";
export type WorkflowActionCondition = {
  field: string;
  operator: WorkflowConditionOperator;
  value: string | number | boolean;
};

export type WorkflowActionCreateTask = AnyRecord & {
  type: "create_task";
  bucket: number;
  title: string;
  why: string;
  steps: string[];
  priority?: TaskPriority;
  expected_impact?: string;
  kind?: TaskKind;
  due_days?: number;
  condition?: WorkflowActionCondition;
};
export type WorkflowActionSendNotification = AnyRecord & {
  type: "send_notification";
  channel: string;
  subject: string;
  message: string;
  condition?: WorkflowActionCondition;
};
export type WorkflowActionExportReportMonthly = AnyRecord & {
  type: "export_report";
  export_type: "monthly_summary_pdf";
  params?: AnyRecord & { period_key?: string };
  condition?: WorkflowActionCondition;
};
export type WorkflowActionExportReportCsv = AnyRecord & {
  type: "export_report";
  export_type: "transactions_csv";
  params?: AnyRecord;
  condition?: WorkflowActionCondition;
};
export type WorkflowActionExportReportOther = AnyRecord & {
  type: "export_report";
  export_type: string;
  params?: AnyRecord;
  condition?: WorkflowActionCondition;
};
export type WorkflowActionDelay = AnyRecord & {
  type: "delay";
  duration_seconds: number;
  description?: string;
  condition?: WorkflowActionCondition;
};
export type WorkflowAction =
  | WorkflowActionCreateTask
  | WorkflowActionSendNotification
  | WorkflowActionExportReportMonthly
  | WorkflowActionExportReportCsv
  | WorkflowActionExportReportOther
  | WorkflowActionDelay
  | (AnyRecord & { type: string });

// Encapsulates end-to-end automation workflow definitions and runtime requests.
// Handles workflow creation, persistence, query listings, and manual trigger executions.
// Directs backend automation engines when orchestrating scheduled user routines.
export type CreateWorkflowRequest = AnyRecord & {
  name: string;
  enabled?: boolean;
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
};
export type Workflow = AnyRecord & {
  id: string;
  name: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
  created_at?: string;
  updated_at?: string;
};
export type ListWorkflowsResponse = AnyRecord & { workflows: Workflow[]; request_id?: string };
export type CreateWorkflowResponse = AnyRecord & { workflow?: Workflow; request_id?: string };
export type RunWorkflowRequest = AnyRecord;
export type RunWorkflowResponse = AnyRecord & { run?: AnyRecord; request_id?: string };

// Blogs
// Classifies educational personal finance articles, authorship, and content metadata.
// Models published blog articles, categorical tags, SEO attributes, and pagination.
// Powers article exploration, reader engagement metrics, and community search views.
export type BlogPostCategory = 'investing' | 'budgeting' | 'tax-planning' | 'debt-management' | 'retirement' | 'insurance' | 'real-estate' | 'market-news' | 'personal-growth';
export type IBlogPost = AnyRecord & {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: BlogPostCategory;
  tags: string[];
  coverImage: string;
  author: {
    name: string;
    avatar: string;
    bio: string;
  };
  readTime: number;
  likes: number;
  views: number;
  isFeatured: boolean;
  isPublished: boolean;
  publishedAt: string;
  userId?: string;
  relatedPosts?: any[];
  seoMeta?: {
    metaTitle: string;
    metaDescription: string;
    keywords: string[];
  };
};
export type ListBlogsResponse = AnyRecord & {
  posts: IBlogPost[];
  pagination: { page: number; limit: number; total: number; pages: number };
};
export type GetBlogResponse = AnyRecord & { post: IBlogPost };

// Growth Stories
// Captures verified personal finance transformation narratives and community journeys.
// Encompasses quantitative metrics, strategic milestones, difficulties, and summaries.
// Supplies educational case study catalogs to inspire user financial goal achievement.
export type GrowthStoryCategory = 'debt-freedom' | 'wealth-building' | 'early-retirement' | 'side-hustle' | 'tax-optimization' | 'family-finance' | 'student-finance';
export type GrowthStoryDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type IGrowthStory = AnyRecord & {
  _id: string;
  title: string;
  slug: string;
  persona: string;
  location: string;
  summary: string;
  challenge: string;
  journey: string;
  outcome: string;
  timeline: string;
  financialMetrics: {
    startingNetWorth: number;
    currentNetWorth: number;
    monthlyIncome: number;
    savingsRate: number;
    debtPaidOff: number;
    investmentReturns: number;
  };
  strategies: string[];
  tags: string[];
  category: GrowthStoryCategory;
  difficulty: GrowthStoryDifficulty;
  isVerified: boolean;
  isFeatured: boolean;
  isPublished: boolean;
  coverImage: string;
  likes: number;
  views: number;
  readTime: number;
  userId?: string;
  publishedAt: string;
};
export type ListGrowthStoriesResponse = AnyRecord & {
  stories: IGrowthStory[];
  pagination: { page: number; limit: number; total: number; pages: number };
};
export type GetGrowthStoryResponse = AnyRecord & { story: IGrowthStory };
