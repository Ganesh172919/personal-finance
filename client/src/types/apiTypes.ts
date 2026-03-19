type AnyRecord = { [key: string]: any };

export type AuthUserResponse = AnyRecord & { request_id?: string };
export type LogoutResponse = AnyRecord & { request_id?: string };

export type BillingCheckoutRequest = AnyRecord & {
  plan_tier?: string;
  seats?: number;
  success_url?: string;
  cancel_url?: string;
};
export type BillingCheckoutResponse = AnyRecord & { url?: string; request_id?: string };
export type BillingPortalResponse = AnyRecord & { url?: string; request_id?: string };

export type PlanLimit = AnyRecord & { key?: string; value?: number | null };
export type PlansResponse = AnyRecord & { plans?: AnyRecord[]; request_id?: string };
export type EntitlementsMeResponse = AnyRecord & { request_id?: string };
export type AppConfigResponse = AnyRecord & { request_id?: string };

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

export type AutopilotPlanRequest = AnyRecord;
export type AutopilotRunIdRequest = AnyRecord & { run_id?: string };
export type AutopilotApproveRequest = AnyRecord & { run_id?: string };
export type AutopilotRunResponse = AnyRecord & {
  run: AnyRecord & { id: string; status?: string };
  request_id?: string;
};

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

export type AnalyticsOverviewResponse = AnyRecord & { request_id?: string };
export type AutomationEventEmitRequest = AnyRecord;
export type AutomationEventEmitResponse = AnyRecord & { accepted?: boolean; request_id?: string };
export type AutomationEventsCatalogResponse = AnyRecord & { events?: AnyRecord[]; request_id?: string };
export type FeatureFlagDeleteResponse = AnyRecord & { request_id?: string };
export type FeatureFlagUpsertRequest = AnyRecord;
export type FeatureFlagUpsertResponse = AnyRecord & { request_id?: string };
export type FeatureFlagsListResponse = AnyRecord & { flags?: AnyRecord[]; request_id?: string };
export type IntegrationSyncRequest = AnyRecord;
export type IntegrationSyncResponse = AnyRecord & {
  run?: AnyRecord & { id?: string; status?: string };
  request_id?: string;
};
export type IntegrationHistoryResponse = AnyRecord & { history: AnyRecord[]; request_id?: string };
export type IntegrationsListResponse = AnyRecord & { connectors: AnyRecord[]; request_id?: string };
export type MarketplaceInstallRequest = AnyRecord & { plugin_key: string; version?: string };
export type MarketplaceInstallResponse = AnyRecord & { install?: AnyRecord; request_id?: string };
export type MarketplaceCatalogResponse = AnyRecord & { plugins: AnyRecord[]; request_id?: string };
export type PluginOperationResponse = AnyRecord & { plugin?: AnyRecord; request_id?: string };
export type PluginsListResponse = AnyRecord & { plugins: AnyRecord[]; request_id?: string };

export type ReferralRedeemRequest = AnyRecord;
export type ReferralRedeemResponse = AnyRecord & { request_id?: string };
export type ReferralsMeResponse = AnyRecord & { request_id?: string };

export type UsageLedgerRow = AnyRecord & {
  feature: string;
  units: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
};
export type UsageLedgerResponse = AnyRecord & { ledger: UsageLedgerRow[]; period_key?: string; request_id?: string };

export type TaskPriority = "low" | "medium" | "high" | string;
export type TaskKind = "cashflow" | "budget" | "debt" | "invest" | "goal" | "education" | "generic" | string;

export type WorkflowTriggerManual = AnyRecord & { type: "manual" };
export type WorkflowTriggerCron = AnyRecord & { type: "cron"; cron: string };
export type WorkflowTriggerEvent = AnyRecord & { type: "event"; event_type: string };
export type WorkflowTrigger =
  | WorkflowTriggerManual
  | WorkflowTriggerCron
  | WorkflowTriggerEvent
  | (AnyRecord & { type: string });

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
};
export type WorkflowActionSendNotification = AnyRecord & {
  type: "send_notification";
  channel: string;
  subject: string;
  message: string;
};
export type WorkflowActionExportReportMonthly = AnyRecord & {
  type: "export_report";
  export_type: "monthly_summary_pdf";
  params?: AnyRecord & { period_key?: string };
};
export type WorkflowActionExportReportCsv = AnyRecord & {
  type: "export_report";
  export_type: "transactions_csv";
  params?: AnyRecord;
};
export type WorkflowActionExportReportOther = AnyRecord & {
  type: "export_report";
  export_type: string;
  params?: AnyRecord;
};
export type WorkflowAction =
  | WorkflowActionCreateTask
  | WorkflowActionSendNotification
  | WorkflowActionExportReportMonthly
  | WorkflowActionExportReportCsv
  | WorkflowActionExportReportOther
  | (AnyRecord & { type: string });

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
