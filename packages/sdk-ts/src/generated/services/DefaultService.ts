/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AcceptOrgInviteRequest } from '../models/AcceptOrgInviteRequest';
import type { AcceptOrgInviteResponse } from '../models/AcceptOrgInviteResponse';
import type { AddOrgMemberRequest } from '../models/AddOrgMemberRequest';
import type { AddOrgMemberResponse } from '../models/AddOrgMemberResponse';
import type { AnalyticsOverviewResponse } from '../models/AnalyticsOverviewResponse';
import type { AppConfigResponse } from '../models/AppConfigResponse';
import type { AuditEventsResponse } from '../models/AuditEventsResponse';
import type { AuthProvidersResponse } from '../models/AuthProvidersResponse';
import type { AuthUserResponse } from '../models/AuthUserResponse';
import type { AutomationEventEmitRequest } from '../models/AutomationEventEmitRequest';
import type { AutomationEventEmitResponse } from '../models/AutomationEventEmitResponse';
import type { AutomationEventsCatalogResponse } from '../models/AutomationEventsCatalogResponse';
import type { AutopilotApproveRequest } from '../models/AutopilotApproveRequest';
import type { AutopilotPlanRequest } from '../models/AutopilotPlanRequest';
import type { AutopilotRunIdRequest } from '../models/AutopilotRunIdRequest';
import type { AutopilotRunResponse } from '../models/AutopilotRunResponse';
import type { BillingCheckoutRequest } from '../models/BillingCheckoutRequest';
import type { BillingCheckoutResponse } from '../models/BillingCheckoutResponse';
import type { BillingPortalResponse } from '../models/BillingPortalResponse';
import type { BudgetEnvelopesResponse } from '../models/BudgetEnvelopesResponse';
import type { CreateAccountRequest } from '../models/CreateAccountRequest';
import type { CreateAccountResponse } from '../models/CreateAccountResponse';
import type { CreateApiKeyRequest } from '../models/CreateApiKeyRequest';
import type { CreateApiKeyResponse } from '../models/CreateApiKeyResponse';
import type { CreateExportRequest } from '../models/CreateExportRequest';
import type { CreateExportResponse } from '../models/CreateExportResponse';
import type { CreateFinancialStoryShareRequest } from '../models/CreateFinancialStoryShareRequest';
import type { CreateFinancialStoryShareResponse } from '../models/CreateFinancialStoryShareResponse';
import type { CreateOrgRequest } from '../models/CreateOrgRequest';
import type { CreateOrgResponse } from '../models/CreateOrgResponse';
import type { CreateRecurringRuleRequest } from '../models/CreateRecurringRuleRequest';
import type { CreateRecurringRuleResponse } from '../models/CreateRecurringRuleResponse';
import type { CreateWorkflowRequest } from '../models/CreateWorkflowRequest';
import type { CreateWorkflowResponse } from '../models/CreateWorkflowResponse';
import type { CsrfTokenResponse } from '../models/CsrfTokenResponse';
import type { EntitlementsMeResponse } from '../models/EntitlementsMeResponse';
import type { ExportJobStatus } from '../models/ExportJobStatus';
import type { FeatureFlagDeleteResponse } from '../models/FeatureFlagDeleteResponse';
import type { FeatureFlagsListResponse } from '../models/FeatureFlagsListResponse';
import type { FeatureFlagUpsertRequest } from '../models/FeatureFlagUpsertRequest';
import type { FeatureFlagUpsertResponse } from '../models/FeatureFlagUpsertResponse';
import type { ForecastResponse } from '../models/ForecastResponse';
import type { GetExportResponse } from '../models/GetExportResponse';
import type { IntegrationConnectionResponse } from '../models/IntegrationConnectionResponse';
import type { IntegrationHealthResponse } from '../models/IntegrationHealthResponse';
import type { IntegrationHistoryResponse } from '../models/IntegrationHistoryResponse';
import type { IntegrationsListResponse } from '../models/IntegrationsListResponse';
import type { IntegrationSyncRequest } from '../models/IntegrationSyncRequest';
import type { IntegrationSyncResponse } from '../models/IntegrationSyncResponse';
import type { ListAccountsResponse } from '../models/ListAccountsResponse';
import type { ListApiKeysResponse } from '../models/ListApiKeysResponse';
import type { ListBudgetAllocationsResponse } from '../models/ListBudgetAllocationsResponse';
import type { ListExportsResponse } from '../models/ListExportsResponse';
import type { ListMerchantsResponse } from '../models/ListMerchantsResponse';
import type { ListNotificationsResponse } from '../models/ListNotificationsResponse';
import type { ListRecurringRulesResponse } from '../models/ListRecurringRulesResponse';
import type { ListWorkflowsResponse } from '../models/ListWorkflowsResponse';
import type { ListWorkflowTemplatesResponse } from '../models/ListWorkflowTemplatesResponse';
import type { LoginRequest } from '../models/LoginRequest';
import type { LogoutResponse } from '../models/LogoutResponse';
import type { LooseSuccessResponse } from '../models/LooseSuccessResponse';
import type { MarketplaceCatalogResponse } from '../models/MarketplaceCatalogResponse';
import type { MarketplaceInstallRequest } from '../models/MarketplaceInstallRequest';
import type { MarketplaceInstallResponse } from '../models/MarketplaceInstallResponse';
import type { MarkNotificationReadResponse } from '../models/MarkNotificationReadResponse';
import type { OrgsMeResponse } from '../models/OrgsMeResponse';
import type { PaginatedLooseSuccessResponse } from '../models/PaginatedLooseSuccessResponse';
import type { PeriodKey } from '../models/PeriodKey';
import type { PlansResponse } from '../models/PlansResponse';
import type { PluginOperationResponse } from '../models/PluginOperationResponse';
import type { PluginsListResponse } from '../models/PluginsListResponse';
import type { PluginVersionUpdateRequest } from '../models/PluginVersionUpdateRequest';
import type { PublicFinancialStoryShareResponse } from '../models/PublicFinancialStoryShareResponse';
import type { RecurringCandidatesResponse } from '../models/RecurringCandidatesResponse';
import type { ReferralRedeemRequest } from '../models/ReferralRedeemRequest';
import type { ReferralRedeemResponse } from '../models/ReferralRedeemResponse';
import type { ReferralsMeResponse } from '../models/ReferralsMeResponse';
import type { RegisterRequest } from '../models/RegisterRequest';
import type { RegisterResponse } from '../models/RegisterResponse';
import type { ResendVerificationRequest } from '../models/ResendVerificationRequest';
import type { ResendVerificationResponse } from '../models/ResendVerificationResponse';
import type { RevokeApiKeyResponse } from '../models/RevokeApiKeyResponse';
import type { RunWorkflowRequest } from '../models/RunWorkflowRequest';
import type { RunWorkflowResponse } from '../models/RunWorkflowResponse';
import type { ToolsExecuteRequest } from '../models/ToolsExecuteRequest';
import type { ToolsExecuteResponse } from '../models/ToolsExecuteResponse';
import type { ToolsSimulateRequest } from '../models/ToolsSimulateRequest';
import type { ToolsSimulateResponse } from '../models/ToolsSimulateResponse';
import type { TransactionsCsvImportRequest } from '../models/TransactionsCsvImportRequest';
import type { TransactionsCsvImportResponse } from '../models/TransactionsCsvImportResponse';
import type { UpdateAccountRequest } from '../models/UpdateAccountRequest';
import type { UpdateAccountResponse } from '../models/UpdateAccountResponse';
import type { UpdateOrgSettingsRequest } from '../models/UpdateOrgSettingsRequest';
import type { UpdateOrgSettingsResponse } from '../models/UpdateOrgSettingsResponse';
import type { UpdateRecurringRuleRequest } from '../models/UpdateRecurringRuleRequest';
import type { UpdateRecurringRuleResponse } from '../models/UpdateRecurringRuleResponse';
import type { UpsertBudgetAllocationRequest } from '../models/UpsertBudgetAllocationRequest';
import type { UpsertBudgetAllocationResponse } from '../models/UpsertBudgetAllocationResponse';
import type { UpsertMerchantRequest } from '../models/UpsertMerchantRequest';
import type { UpsertMerchantResponse } from '../models/UpsertMerchantResponse';
import type { UsageEventIngestResponse } from '../models/UsageEventIngestResponse';
import type { UsageEventRequest } from '../models/UsageEventRequest';
import type { UsageLedgerResponse } from '../models/UsageLedgerResponse';
import type { VerifyEmailRequest } from '../models/VerifyEmailRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DefaultService {
    /**
     * List my organizations
     * @param xOrgId Optional organization id to select tenant context.
     * @returns OrgsMeResponse Organizations visible to the current user.
     * @throws ApiError
     */
    public static orgsMe(
        xOrgId?: string,
    ): CancelablePromise<OrgsMeResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/orgs/me',
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Create an organization
     * @param requestBody
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns CreateOrgResponse Organization created.
     * @throws ApiError
     */
    public static createOrg(
        requestBody: CreateOrgRequest,
        xCsrfToken?: string,
    ): CancelablePromise<CreateOrgResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/orgs',
            headers: {
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                402: `Payment required`,
                409: `Conflict`,
            },
        });
    }
    /**
     * Add a member to an organization
     * @param orgId
     * @param requestBody
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns AddOrgMemberResponse Member added.
     * @throws ApiError
     */
    public static addOrgMember(
        orgId: string,
        requestBody: AddOrgMemberRequest,
        xCsrfToken?: string,
    ): CancelablePromise<AddOrgMemberResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/orgs/{orgId}/members',
            path: {
                'orgId': orgId,
            },
            headers: {
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                402: `Payment required`,
                403: `Forbidden`,
                404: `Not found`,
                409: `Conflict`,
            },
        });
    }
    /**
     * List API keys for the active org
     * @param xOrgId Optional organization id to select tenant context.
     * @returns ListApiKeysResponse API keys.
     * @throws ApiError
     */
    public static listApiKeys(
        xOrgId?: string,
    ): CancelablePromise<ListApiKeysResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/api-keys',
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Create an API key for the active org
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns CreateApiKeyResponse API key created.
     * @throws ApiError
     */
    public static createApiKey(
        requestBody: CreateApiKeyRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<CreateApiKeyResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/api-keys',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Revoke an API key
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns RevokeApiKeyResponse Key revoked.
     * @throws ApiError
     */
    public static revokeApiKey(
        id: string,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<RevokeApiKeyResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/api-keys/{id}/revoke',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * Read usage ledger for the active org
     * @param xOrgId Optional organization id to select tenant context.
     * @param periodKey Billing period key (YYYY-MM). Defaults to current period.
     * @returns UsageLedgerResponse Usage, limits, and ledger rows.
     * @throws ApiError
     */
    public static usageLedger(
        xOrgId?: string,
        periodKey?: string,
    ): CancelablePromise<UsageLedgerResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/usage/ledger',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'period_key': periodKey,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Create a billing checkout session (Stripe) or activate plan (stub)
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns BillingCheckoutResponse Checkout session created or plan activated.
     * @throws ApiError
     */
    public static billingCheckout(
        requestBody: BillingCheckoutRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<BillingCheckoutResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/billing/checkout',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Create a billing portal session (Stripe) or return an app link (stub)
     * @param xOrgId Optional organization id to select tenant context.
     * @param returnUrl
     * @returns BillingPortalResponse Billing portal response.
     * @throws ApiError
     */
    public static billingPortal(
        xOrgId?: string,
        returnUrl?: string,
    ): CancelablePromise<BillingPortalResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/billing/portal',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'return_url': returnUrl,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Stripe webhook (server-to-server)
     * @param stripeSignature
     * @param requestBody
     * @returns any Webhook received.
     * @throws ApiError
     */
    public static stripeWebhook(
        stripeSignature: string,
        requestBody: Record<string, any>,
    ): CancelablePromise<{
        received: boolean;
        request_id: string;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/billing/webhook',
            headers: {
                'stripe-signature': stripeSignature,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * List workflows for the active org
     * @param xOrgId Optional organization id to select tenant context.
     * @returns ListWorkflowsResponse Workflows.
     * @throws ApiError
     */
    public static listWorkflows(
        xOrgId?: string,
    ): CancelablePromise<ListWorkflowsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/workflows',
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Create a workflow for the active org
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns CreateWorkflowResponse Workflow created.
     * @throws ApiError
     */
    public static createWorkflow(
        requestBody: CreateWorkflowRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<CreateWorkflowResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/workflows',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * List workflow templates (built-in + installed plugins)
     * @param xOrgId Optional organization id to select tenant context.
     * @returns ListWorkflowTemplatesResponse Workflow templates available to the org.
     * @throws ApiError
     */
    public static listWorkflowTemplates(
        xOrgId?: string,
    ): CancelablePromise<ListWorkflowTemplatesResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/workflows/templates',
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Run a workflow (queued when Redis is enabled)
     * @param id
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns RunWorkflowResponse Workflow run accepted or completed inline.
     * @throws ApiError
     */
    public static runWorkflow(
        id: string,
        requestBody: RunWorkflowRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<RunWorkflowResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/workflows/{id}/run',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Update organization settings
     * @param orgId
     * @param requestBody
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns UpdateOrgSettingsResponse Organization updated.
     * @throws ApiError
     */
    public static updateOrgSettings(
        orgId: string,
        requestBody: UpdateOrgSettingsRequest,
        xCsrfToken?: string,
    ): CancelablePromise<UpdateOrgSettingsResponse> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/orgs/{orgId}/settings',
            path: {
                'orgId': orgId,
            },
            headers: {
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * Accept an organization invite
     * @param requestBody
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns AcceptOrgInviteResponse Invite accepted.
     * @throws ApiError
     */
    public static acceptOrgInvite(
        requestBody: AcceptOrgInviteRequest,
        xCsrfToken?: string,
    ): CancelablePromise<AcceptOrgInviteResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/org-invites/accept',
            headers: {
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                402: `Payment required`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * Get referral code + stats for the active org
     * @param xOrgId Optional organization id to select tenant context.
     * @returns ReferralsMeResponse Referral information.
     * @throws ApiError
     */
    public static referralsMe(
        xOrgId?: string,
    ): CancelablePromise<ReferralsMeResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/referrals/me',
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Redeem a referral code for the active org
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns ReferralRedeemResponse Referral already redeemed (idempotent).
     * @throws ApiError
     */
    public static referralRedeem(
        requestBody: ReferralRedeemRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<ReferralRedeemResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/referrals/redeem',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * List exports for the active org
     * @param xOrgId Optional organization id to select tenant context.
     * @param status
     * @param limit
     * @returns ListExportsResponse Export jobs.
     * @throws ApiError
     */
    public static listExports(
        xOrgId?: string,
        status?: ExportJobStatus,
        limit?: number,
    ): CancelablePromise<ListExportsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/exports',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'status': status,
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Create an export job
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns CreateExportResponse Existing export returned (idempotency hit).
     * @throws ApiError
     */
    public static createExport(
        requestBody: CreateExportRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<CreateExportResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/exports',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                402: `Payment required`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Get export job by id
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @returns GetExportResponse Export job.
     * @throws ApiError
     */
    public static getExportById(
        id: string,
        xOrgId?: string,
    ): CancelablePromise<GetExportResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/exports/{id}',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * Download an export file
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @returns binary Export file download.
     * @throws ApiError
     */
    public static downloadExport(
        id: string,
        xOrgId?: string,
    ): CancelablePromise<Blob> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/exports/{id}/download',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
                409: `Conflict`,
            },
        });
    }
    /**
     * List audit events for the active org
     * @param xOrgId Optional organization id to select tenant context.
     * @param action
     * @param limit
     * @returns AuditEventsResponse Audit events.
     * @throws ApiError
     */
    public static listAuditEvents(
        xOrgId?: string,
        action?: string,
        limit?: number,
    ): CancelablePromise<AuditEventsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/audit/events',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'action': action,
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Get my app config (org + features + entitlements)
     * @param xOrgId Optional organization id to select tenant context.
     * @returns AppConfigResponse Current user config.
     * @throws ApiError
     */
    public static configMe(
        xOrgId?: string,
    ): CancelablePromise<AppConfigResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/config/me',
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * List available subscription plans
     * @returns PlansResponse Plan catalog.
     * @throws ApiError
     */
    public static listPlans(): CancelablePromise<PlansResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/plans',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get my entitlements for the active org
     * @param xOrgId Optional organization id to select tenant context.
     * @returns EntitlementsMeResponse Resolved entitlements and usage.
     * @throws ApiError
     */
    public static entitlementsMe(
        xOrgId?: string,
    ): CancelablePromise<EntitlementsMeResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/entitlements/me',
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Ingest an internal usage event
     * @param requestBody
     * @returns UsageEventIngestResponse Usage event accepted.
     * @throws ApiError
     */
    public static ingestUsageEvent(
        requestBody: UsageEventRequest,
    ): CancelablePromise<UsageEventIngestResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/usage-events',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * List marketplace catalog entries
     * @param xOrgId Optional organization id to select tenant context.
     * @param q
     * @param status
     * @returns MarketplaceCatalogResponse Marketplace catalog.
     * @throws ApiError
     */
    public static listMarketplaceCatalog(
        xOrgId?: string,
        q?: string,
        status?: 'active' | 'preview' | 'deprecated',
    ): CancelablePromise<MarketplaceCatalogResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/marketplace/catalog',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'q': q,
                'status': status,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Install a marketplace plugin in the active org
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns MarketplaceInstallResponse Plugin installed.
     * @throws ApiError
     */
    public static installMarketplacePlugin(
        requestBody: MarketplaceInstallRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<MarketplaceInstallResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/marketplace/install',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * List plugins installed for the active org
     * @param xOrgId Optional organization id to select tenant context.
     * @returns PluginsListResponse Installed plugins.
     * @throws ApiError
     */
    public static listInstalledPlugins(
        xOrgId?: string,
    ): CancelablePromise<PluginsListResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/plugins',
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Update installed plugin version
     * @param id
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns PluginOperationResponse Plugin updated.
     * @throws ApiError
     */
    public static updateInstalledPluginVersion(
        id: string,
        requestBody: PluginVersionUpdateRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<PluginOperationResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/plugins/{id}/update',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * Disable an installed plugin
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns PluginOperationResponse Plugin disabled.
     * @throws ApiError
     */
    public static uninstallPlugin(
        id: string,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<PluginOperationResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/plugins/{id}/uninstall',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * List integrations for the active org
     * @param xOrgId Optional organization id to select tenant context.
     * @returns IntegrationsListResponse Integrations and latest sync state.
     * @throws ApiError
     */
    public static listIntegrations(
        xOrgId?: string,
    ): CancelablePromise<IntegrationsListResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/integrations',
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Get integration connection health/state
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @returns IntegrationHealthResponse Integration connection state.
     * @throws ApiError
     */
    public static integrationHealth(
        id: string,
        xOrgId?: string,
    ): CancelablePromise<IntegrationHealthResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/integrations/{id}/health',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * Connect an integration
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @param requestBody
     * @returns IntegrationConnectionResponse Integration connection updated.
     * @throws ApiError
     */
    public static connectIntegration(
        id: string,
        xOrgId?: string,
        xCsrfToken?: string,
        requestBody?: Record<string, any>,
    ): CancelablePromise<IntegrationConnectionResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/integrations/{id}/connect',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * Disconnect an integration
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @param requestBody
     * @returns IntegrationConnectionResponse Integration connection updated.
     * @throws ApiError
     */
    public static disconnectIntegration(
        id: string,
        xOrgId?: string,
        xCsrfToken?: string,
        requestBody?: Record<string, any>,
    ): CancelablePromise<IntegrationConnectionResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/integrations/{id}/disconnect',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * Trigger an integration sync run
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @param requestBody
     * @returns IntegrationSyncResponse Integration sync queued/completed.
     * @throws ApiError
     */
    public static syncIntegration(
        id: string,
        xOrgId?: string,
        xCsrfToken?: string,
        requestBody?: IntegrationSyncRequest,
    ): CancelablePromise<IntegrationSyncResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/integrations/{id}/sync',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * List integration sync history
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @param limit
     * @returns IntegrationHistoryResponse Integration sync history.
     * @throws ApiError
     */
    public static integrationHistory(
        id: string,
        xOrgId?: string,
        limit?: number,
    ): CancelablePromise<IntegrationHistoryResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/integrations/{id}/history',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * List automation event catalog
     * @param xOrgId Optional organization id to select tenant context.
     * @returns AutomationEventsCatalogResponse Supported event types for automation workflows.
     * @throws ApiError
     */
    public static listAutomationEvents(
        xOrgId?: string,
    ): CancelablePromise<AutomationEventsCatalogResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/automation/events',
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Emit a domain event for automation workflows
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns AutomationEventEmitResponse Event accepted.
     * @throws ApiError
     */
    public static emitAutomationEvent(
        requestBody: AutomationEventEmitRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<AutomationEventEmitResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/automation/events/emit',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * List feature flags for the active org
     * @param xOrgId Optional organization id to select tenant context.
     * @param keyPrefix
     * @param enabled
     * @returns FeatureFlagsListResponse Feature flags.
     * @throws ApiError
     */
    public static listFeatureFlags(
        xOrgId?: string,
        keyPrefix?: string,
        enabled?: boolean,
    ): CancelablePromise<FeatureFlagsListResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/feature-flags',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'key_prefix': keyPrefix,
                'enabled': enabled,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Create or update a feature flag
     * @param key
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns FeatureFlagUpsertResponse Feature flag saved.
     * @throws ApiError
     */
    public static upsertFeatureFlag(
        key: string,
        requestBody: FeatureFlagUpsertRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<FeatureFlagUpsertResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/v1/feature-flags/{key}',
            path: {
                'key': key,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Delete a feature flag
     * @param key
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns FeatureFlagDeleteResponse Feature flag deleted.
     * @throws ApiError
     */
    public static deleteFeatureFlag(
        key: string,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<FeatureFlagDeleteResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/v1/feature-flags/{key}',
            path: {
                'key': key,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Read analytics overview for the active org
     * @param xOrgId Optional organization id to select tenant context.
     * @param periodKey
     * @returns AnalyticsOverviewResponse Analytics snapshot.
     * @throws ApiError
     */
    public static analyticsOverview(
        xOrgId?: string,
        periodKey?: string,
    ): CancelablePromise<AnalyticsOverviewResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/analytics/overview',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'period_key': periodKey,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Create a share link for a financial story snapshot
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @param requestBody
     * @returns CreateFinancialStoryShareResponse Share link created.
     * @throws ApiError
     */
    public static createFinancialStoryShare(
        xOrgId?: string,
        xCsrfToken?: string,
        requestBody?: CreateFinancialStoryShareRequest,
    ): CancelablePromise<CreateFinancialStoryShareResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/shares/financial-story',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Read a public financial story share payload by token
     * @param token
     * @returns PublicFinancialStoryShareResponse Public share payload.
     * @throws ApiError
     */
    public static publicFinancialStoryShare(
        token: string,
    ): CancelablePromise<PublicFinancialStoryShareResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/public/shares/financial-story/{token}',
            path: {
                'token': token,
            },
            errors: {
                400: `Bad request`,
                404: `Not found`,
            },
        });
    }
    /**
     * List enabled authentication providers
     * @returns AuthProvidersResponse Providers.
     * @throws ApiError
     */
    public static authProviders(): CancelablePromise<AuthProvidersResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/auth/providers',
        });
    }
    /**
     * Issue a CSRF token cookie + response
     * @returns CsrfTokenResponse CSRF token.
     * @throws ApiError
     */
    public static authCsrf(): CancelablePromise<CsrfTokenResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/auth/csrf',
        });
    }
    /**
     * Start Google OAuth login
     * @returns void
     * @throws ApiError
     */
    public static authGoogle(): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/auth/google',
            errors: {
                302: `Redirect to Google OAuth consent screen.`,
                501: `Google OAuth is not configured.`,
            },
        });
    }
    /**
     * Google OAuth callback
     * @returns void
     * @throws ApiError
     */
    public static authGoogleCallback(): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/auth/google/callback',
            errors: {
                302: `Redirect to the client app after login.`,
                501: `Google OAuth is not configured.`,
            },
        });
    }
    /**
     * Register a new user
     * @param requestBody
     * @returns RegisterResponse Registration accepted (email verification required).
     * @throws ApiError
     */
    public static authRegister(
        requestBody: RegisterRequest,
    ): CancelablePromise<RegisterResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/auth/register',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
            },
        });
    }
    /**
     * Login with email + password
     * @param requestBody
     * @returns AuthUserResponse Login successful.
     * @throws ApiError
     */
    public static authLogin(
        requestBody: LoginRequest,
    ): CancelablePromise<AuthUserResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/auth/login',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Verify email (OTP) and create session
     * @param requestBody
     * @returns AuthUserResponse Email verified.
     * @throws ApiError
     */
    public static authVerifyEmail(
        requestBody: VerifyEmailRequest,
    ): CancelablePromise<AuthUserResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/auth/verify-email',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
            },
        });
    }
    /**
     * Resend verification OTP
     * @param requestBody
     * @returns ResendVerificationResponse Verification OTP resent.
     * @throws ApiError
     */
    public static authResendVerification(
        requestBody: ResendVerificationRequest,
    ): CancelablePromise<ResendVerificationResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/auth/resend-verification',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
            },
        });
    }
    /**
     * Get the current authenticated user profile
     * @returns AuthUserResponse User profile.
     * @throws ApiError
     */
    public static authProfile(): CancelablePromise<AuthUserResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/auth/profile',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Logout (clears session cookie)
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LogoutResponse Logout complete.
     * @throws ApiError
     */
    public static authLogout(
        xCsrfToken?: string,
    ): CancelablePromise<LogoutResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/auth/logout',
            headers: {
                'X-CSRF-Token': xCsrfToken,
            },
            errors: {
                403: `Forbidden`,
            },
        });
    }
    /**
     * Process an AI command
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Command processed.
     * @throws ApiError
     */
    public static processCommand(
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/process-command',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                402: `Payment required`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Run a what-if scenario
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Scenario result.
     * @throws ApiError
     */
    public static whatIfScenario(
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/scenarios/what-if',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                402: `Payment required`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Get AI Core status snapshot
     * @returns LooseSuccessResponse AI Core status.
     * @throws ApiError
     */
    public static getAiCoreStatus(): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/ai-core/status',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Add an investment to my profile
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Investment added.
     * @throws ApiError
     */
    public static addFinancialProfileInvestment(
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/financial-profiles/investments',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get my financial profile
     * @param xOrgId Optional organization id to select tenant context.
     * @returns LooseSuccessResponse Financial profile.
     * @throws ApiError
     */
    public static getFinancialProfileMe(
        xOrgId?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/financial-profiles/me',
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Update my financial profile
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Updated profile.
     * @throws ApiError
     */
    public static updateFinancialProfileMe(
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/v1/financial-profiles/me',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * @deprecated
     * Get a user's financial profile (deprecated)
     * @param userId
     * @param xOrgId Optional organization id to select tenant context.
     * @returns LooseSuccessResponse Financial profile.
     * @throws ApiError
     */
    public static getFinancialProfileByUserId(
        userId: string,
        xOrgId?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/financial-profiles/{userId}',
            path: {
                'userId': userId,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * @deprecated
     * Update a user's financial profile (deprecated)
     * @param userId
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Updated profile.
     * @throws ApiError
     */
    public static updateFinancialProfileByUserId(
        userId: string,
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/v1/financial-profiles/{userId}',
            path: {
                'userId': userId,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * List recent agent outputs
     * @param xOrgId Optional organization id to select tenant context.
     * @param limit
     * @returns PaginatedLooseSuccessResponse Recent agent outputs.
     * @throws ApiError
     */
    public static listRecentAgentOutputs(
        xOrgId?: string,
        limit?: number,
    ): CancelablePromise<PaginatedLooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/agent-outputs/recent',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get an agent output by id
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @returns LooseSuccessResponse Agent output.
     * @throws ApiError
     */
    public static getAgentOutput(
        id: string,
        xOrgId?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/agent-outputs/{id}',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Submit feedback for an agent output
     * @param id
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Feedback saved.
     * @throws ApiError
     */
    public static submitAgentOutputFeedback(
        id: string,
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/agent-outputs/{id}/feedback',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * List agent outputs for a user
     * @param userId
     * @param xOrgId Optional organization id to select tenant context.
     * @returns PaginatedLooseSuccessResponse Agent outputs.
     * @throws ApiError
     */
    public static listAgentOutputsByUser(
        userId: string,
        xOrgId?: string,
    ): CancelablePromise<PaginatedLooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/agent-outputs/user/{userId}',
            path: {
                'userId': userId,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * List transactions
     * @param xOrgId Optional organization id to select tenant context.
     * @param page
     * @param limit
     * @param from
     * @param to
     * @param type
     * @param category
     * @returns PaginatedLooseSuccessResponse Transactions list.
     * @throws ApiError
     */
    public static listTransactions(
        xOrgId?: string,
        page?: number,
        limit?: number,
        from?: string,
        to?: string,
        type?: 'income' | 'expense' | 'investment',
        category?: string,
    ): CancelablePromise<PaginatedLooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/transactions',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'page': page,
                'limit': limit,
                'from': from,
                'to': to,
                'type': type,
                'category': category,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Create a transaction
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Transaction created.
     * @throws ApiError
     */
    public static createTransaction(
        requestBody: {
            amount: number;
            category: string;
            description: string;
            date?: string;
            type: 'income' | 'expense' | 'investment';
        },
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/transactions',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Bulk import transactions
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Transactions imported.
     * @throws ApiError
     */
    public static importTransactions(
        requestBody: {
            rows: Array<Record<string, any>>;
        },
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/transactions/import',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Update a transaction
     * @param id
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Transaction updated.
     * @throws ApiError
     */
    public static updateTransaction(
        id: string,
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/transactions/{id}',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Delete a transaction
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Transaction deleted.
     * @throws ApiError
     */
    public static deleteTransaction(
        id: string,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/v1/transactions/{id}',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * List recent transactions
     * @param xOrgId Optional organization id to select tenant context.
     * @param limit
     * @returns PaginatedLooseSuccessResponse Recent transactions.
     * @throws ApiError
     */
    public static listRecentTransactions(
        xOrgId?: string,
        limit?: number,
    ): CancelablePromise<PaginatedLooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/transactions/recent',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get transaction summary
     * @param from
     * @param to
     * @param xOrgId Optional organization id to select tenant context.
     * @param groupBy
     * @param topCategories
     * @returns LooseSuccessResponse Summary payload.
     * @throws ApiError
     */
    public static getTransactionsSummary(
        from: string,
        to: string,
        xOrgId?: string,
        groupBy?: string,
        topCategories?: number,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/transactions/summary',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'from': from,
                'to': to,
                'groupBy': groupBy,
                'topCategories': topCategories,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get dashboard summary
     * @param xOrgId Optional organization id to select tenant context.
     * @param from
     * @param to
     * @returns LooseSuccessResponse Dashboard summary.
     * @throws ApiError
     */
    public static getDashboardSummary(
        xOrgId?: string,
        from?: string,
        to?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/dashboard/summary',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'from': from,
                'to': to,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get portfolio summary
     * @param xOrgId Optional organization id to select tenant context.
     * @param months
     * @returns LooseSuccessResponse Portfolio summary.
     * @throws ApiError
     */
    public static getPortfolioSummary(
        xOrgId?: string,
        months?: number,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/summary',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'months': months,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Create a financial goal
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Goal created.
     * @throws ApiError
     */
    public static createGoal(
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/goals',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Update a financial goal
     * @param goalId
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Goal updated.
     * @throws ApiError
     */
    public static updateGoal(
        goalId: string,
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/goals/{goalId}',
            path: {
                'goalId': goalId,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Delete a financial goal
     * @param goalId
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Goal deleted.
     * @throws ApiError
     */
    public static deleteGoal(
        goalId: string,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/v1/goals/{goalId}',
            path: {
                'goalId': goalId,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Create a debt record
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Debt created.
     * @throws ApiError
     */
    public static createDebt(
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/debts',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Update a debt record
     * @param debtId
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Debt updated.
     * @throws ApiError
     */
    public static updateDebt(
        debtId: string,
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/debts/{debtId}',
            path: {
                'debtId': debtId,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Delete a debt record
     * @param debtId
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Debt deleted.
     * @throws ApiError
     */
    public static deleteDebt(
        debtId: string,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/v1/debts/{debtId}',
            path: {
                'debtId': debtId,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * List finance accounts
     * @param xOrgId Optional organization id to select tenant context.
     * @returns ListAccountsResponse Accounts.
     * @throws ApiError
     */
    public static financeListAccounts(
        xOrgId?: string,
    ): CancelablePromise<ListAccountsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/finance/accounts',
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Create a finance account (admin)
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns CreateAccountResponse Account created.
     * @throws ApiError
     */
    public static financeCreateAccount(
        requestBody: CreateAccountRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<CreateAccountResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/finance/accounts',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Update a finance account (admin)
     * @param id
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns UpdateAccountResponse Account updated.
     * @throws ApiError
     */
    public static financeUpdateAccount(
        id: string,
        requestBody: UpdateAccountRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<UpdateAccountResponse> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/finance/accounts/{id}',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * List merchants
     * @param xOrgId Optional organization id to select tenant context.
     * @param q
     * @param limit
     * @returns ListMerchantsResponse Merchants.
     * @throws ApiError
     */
    public static financeListMerchants(
        xOrgId?: string,
        q?: string,
        limit?: number,
    ): CancelablePromise<ListMerchantsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/finance/merchants',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'q': q,
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Upsert merchant (admin)
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns UpsertMerchantResponse Merchant upserted.
     * @throws ApiError
     */
    public static financeUpsertMerchant(
        requestBody: UpsertMerchantRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<UpsertMerchantResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/finance/merchants',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * List budget allocations for a period
     * @param periodKey
     * @param xOrgId Optional organization id to select tenant context.
     * @param limit
     * @returns ListBudgetAllocationsResponse Allocations.
     * @throws ApiError
     */
    public static financeListBudgetAllocations(
        periodKey: string,
        xOrgId?: string,
        limit?: number,
    ): CancelablePromise<ListBudgetAllocationsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/finance/budgets/{periodKey}/allocations',
            path: {
                'periodKey': periodKey,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'limit': limit,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Upsert a budget allocation (admin)
     * @param periodKey
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns UpsertBudgetAllocationResponse Allocation upserted.
     * @throws ApiError
     */
    public static financeUpsertBudgetAllocation(
        periodKey: string,
        requestBody: UpsertBudgetAllocationRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<UpsertBudgetAllocationResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/v1/finance/budgets/{periodKey}/allocations',
            path: {
                'periodKey': periodKey,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Get budget envelopes (planned vs spent)
     * @param periodKey
     * @param xOrgId Optional organization id to select tenant context.
     * @returns BudgetEnvelopesResponse Envelope summary.
     * @throws ApiError
     */
    public static financeGetBudgetEnvelopes(
        periodKey: string,
        xOrgId?: string,
    ): CancelablePromise<BudgetEnvelopesResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/finance/budgets/{periodKey}/envelopes',
            path: {
                'periodKey': periodKey,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Detect recurring candidates
     * @param xOrgId Optional organization id to select tenant context.
     * @param daysBack
     * @param limit
     * @param minOccurrences
     * @returns RecurringCandidatesResponse Recurring candidates.
     * @throws ApiError
     */
    public static financeListRecurringCandidates(
        xOrgId?: string,
        daysBack?: number,
        limit?: number,
        minOccurrences?: number,
    ): CancelablePromise<RecurringCandidatesResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/finance/recurring/candidates',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'days_back': daysBack,
                'limit': limit,
                'min_occurrences': minOccurrences,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * List recurring rules
     * @param xOrgId Optional organization id to select tenant context.
     * @param limit
     * @returns ListRecurringRulesResponse Recurring rules.
     * @throws ApiError
     */
    public static financeListRecurringRules(
        xOrgId?: string,
        limit?: number,
    ): CancelablePromise<ListRecurringRulesResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/finance/recurring',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Create recurring rule (admin)
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns CreateRecurringRuleResponse Rule created.
     * @throws ApiError
     */
    public static financeCreateRecurringRule(
        requestBody: CreateRecurringRuleRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<CreateRecurringRuleResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/finance/recurring',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Update recurring rule (admin)
     * @param id
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns UpdateRecurringRuleResponse Rule updated.
     * @throws ApiError
     */
    public static financeUpdateRecurringRule(
        id: string,
        requestBody: UpdateRecurringRuleRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<UpdateRecurringRuleResponse> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/finance/recurring/{id}',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * Get a baseline forecast projection
     * @param xOrgId Optional organization id to select tenant context.
     * @param periodKey
     * @param months
     * @param topCategories
     * @returns ForecastResponse Forecast projection.
     * @throws ApiError
     */
    public static financeGetForecast(
        xOrgId?: string,
        periodKey?: PeriodKey,
        months?: number,
        topCategories?: number,
    ): CancelablePromise<ForecastResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/finance/forecast',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'period_key': periodKey,
                'months': months,
                'top_categories': topCategories,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Simulate a tool call
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns ToolsSimulateResponse Tool simulation result.
     * @throws ApiError
     */
    public static toolsSimulate(
        requestBody: ToolsSimulateRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<ToolsSimulateResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/tools/simulate',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
            },
        });
    }
    /**
     * Execute a tool call (idempotent)
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns ToolsExecuteResponse Tool execution result.
     * @throws ApiError
     */
    public static toolsExecute(
        requestBody: ToolsExecuteRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<ToolsExecuteResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/tools/execute',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                402: `Payment required`,
                403: `Forbidden`,
                409: `Conflict`,
            },
        });
    }
    /**
     * Import transactions from CSV (admin)
     * @param formData
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns TransactionsCsvImportResponse CSV import dry-run result.
     * @throws ApiError
     */
    public static integrationsTransactionsCsvImport(
        formData: TransactionsCsvImportRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<TransactionsCsvImportResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/integrations/transactions_csv/import',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                402: `Payment required`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * List in-app notifications
     * @param xOrgId Optional organization id to select tenant context.
     * @param status
     * @param limit
     * @returns ListNotificationsResponse Notifications.
     * @throws ApiError
     */
    public static notificationsList(
        xOrgId?: string,
        status?: 'unread' | 'read',
        limit?: number,
    ): CancelablePromise<ListNotificationsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/notifications',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'status': status,
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Mark notification as read
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns MarkNotificationReadResponse Notification updated.
     * @throws ApiError
     */
    public static notificationsMarkRead(
        id: string,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<MarkNotificationReadResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/notifications/{id}/read',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Create an autopilot plan (AI)
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns AutopilotRunResponse Autopilot run created.
     * @throws ApiError
     */
    public static autopilotPlan(
        requestBody: AutopilotPlanRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<AutopilotRunResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/autopilot/plan',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                402: `Payment required`,
            },
        });
    }
    /**
     * Simulate tool calls for an autopilot run
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns AutopilotRunResponse Autopilot run updated.
     * @throws ApiError
     */
    public static autopilotSimulate(
        requestBody: AutopilotRunIdRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<AutopilotRunResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/autopilot/simulate',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Approve tool calls for an autopilot run
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns AutopilotRunResponse Autopilot run updated.
     * @throws ApiError
     */
    public static autopilotApprove(
        requestBody: AutopilotApproveRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<AutopilotRunResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/autopilot/approve',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Execute approved tool calls for an autopilot run
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns AutopilotRunResponse Autopilot run executed.
     * @throws ApiError
     */
    public static autopilotExecute(
        requestBody: AutopilotRunIdRequest,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<AutopilotRunResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/autopilot/execute',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Get an autopilot run
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @returns AutopilotRunResponse Autopilot run.
     * @throws ApiError
     */
    public static autopilotGetRun(
        id: string,
        xOrgId?: string,
    ): CancelablePromise<AutopilotRunResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/autopilot/runs/{id}',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Server-sent events stream (org scoped)
     * @param xOrgId Optional organization id to select tenant context.
     * @returns string Event stream (SSE).
     * @throws ApiError
     */
    public static eventsStream(
        xOrgId?: string,
    ): CancelablePromise<string> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/events/stream',
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Create a chat session
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Session created.
     * @throws ApiError
     */
    public static createChatSession(
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/chat/sessions',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * List chat sessions
     * @param xOrgId Optional organization id to select tenant context.
     * @param page
     * @param limit
     * @returns PaginatedLooseSuccessResponse Session list.
     * @throws ApiError
     */
    public static listChatSessions(
        xOrgId?: string,
        page?: number,
        limit?: number,
    ): CancelablePromise<PaginatedLooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/chat/sessions',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'page': page,
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get a chat session
     * @param sessionId
     * @param xOrgId Optional organization id to select tenant context.
     * @returns LooseSuccessResponse Chat session.
     * @throws ApiError
     */
    public static getChatSession(
        sessionId: string,
        xOrgId?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/chat/sessions/{sessionId}',
            path: {
                'sessionId': sessionId,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Delete a chat session
     * @param sessionId
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Session deleted.
     * @throws ApiError
     */
    public static deleteChatSession(
        sessionId: string,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/v1/chat/sessions/{sessionId}',
            path: {
                'sessionId': sessionId,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Rename a chat session
     * @param sessionId
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Session renamed.
     * @throws ApiError
     */
    public static renameChatSession(
        sessionId: string,
        requestBody: {
            title: string;
        },
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/chat/sessions/{sessionId}',
            path: {
                'sessionId': sessionId,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * List messages in a chat session
     * @param sessionId
     * @param xOrgId Optional organization id to select tenant context.
     * @param page
     * @param limit
     * @returns PaginatedLooseSuccessResponse Messages list.
     * @throws ApiError
     */
    public static listChatMessages(
        sessionId: string,
        xOrgId?: string,
        page?: number,
        limit?: number,
    ): CancelablePromise<PaginatedLooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/chat/sessions/{sessionId}/messages',
            path: {
                'sessionId': sessionId,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'page': page,
                'limit': limit,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Send a message in a chat session
     * @param sessionId
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Message accepted and response returned.
     * @throws ApiError
     */
    public static sendChatMessage(
        sessionId: string,
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/chat/sessions/{sessionId}/messages',
            path: {
                'sessionId': sessionId,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                402: `Payment required`,
                404: `Not found`,
            },
        });
    }
    /**
     * Create tasks from an AI plan
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Tasks created.
     * @throws ApiError
     */
    public static createTasksFromPlan(
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/tasks/from-plan',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * List tasks
     * @param xOrgId Optional organization id to select tenant context.
     * @param status
     * @param limit
     * @returns PaginatedLooseSuccessResponse Tasks list.
     * @throws ApiError
     */
    public static listTasks(
        xOrgId?: string,
        status?: string,
        limit?: number,
    ): CancelablePromise<PaginatedLooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/tasks',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'status': status,
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get a task by id
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @returns LooseSuccessResponse Task details.
     * @throws ApiError
     */
    public static getTask(
        id: string,
        xOrgId?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/tasks/{id}',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Update task status/details
     * @param id
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Task updated.
     * @throws ApiError
     */
    public static updateTask(
        id: string,
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/tasks/{id}',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Apply task effects to financial data
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @param requestBody
     * @returns LooseSuccessResponse Task effects applied.
     * @throws ApiError
     */
    public static applyTask(
        id: string,
        xOrgId?: string,
        xCsrfToken?: string,
        requestBody?: Record<string, any>,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/tasks/{id}/apply',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Parse an uploaded receipt
     * @param formData
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Receipt parsed.
     * @throws ApiError
     */
    public static parseReceipt(
        formData: {
            file: Blob;
        },
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/receipts/parse',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Confirm parsed receipt values
     * @param id
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Receipt confirmed.
     * @throws ApiError
     */
    public static confirmReceipt(
        id: string,
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/receipts/{id}/confirm',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * List receipts
     * @param xOrgId Optional organization id to select tenant context.
     * @param page
     * @param limit
     * @returns PaginatedLooseSuccessResponse Receipt list.
     * @throws ApiError
     */
    public static listReceipts(
        xOrgId?: string,
        page?: number,
        limit?: number,
    ): CancelablePromise<PaginatedLooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/receipts',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'page': page,
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get a receipt by id
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @returns LooseSuccessResponse Receipt details.
     * @throws ApiError
     */
    public static getReceipt(
        id: string,
        xOrgId?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/receipts/{id}',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Delete a receipt
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Receipt deleted.
     * @throws ApiError
     */
    public static deleteReceipt(
        id: string,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/v1/receipts/{id}',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Recognize handwriting from journal media
     * @param formData
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Handwriting recognized.
     * @throws ApiError
     */
    public static recognizeJournalHandwriting(
        formData: {
            file: Blob;
        },
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/financial-journal/recognize-handwriting',
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * List financial journal entries
     * @param xOrgId Optional organization id to select tenant context.
     * @param page
     * @param limit
     * @returns PaginatedLooseSuccessResponse Journal entries.
     * @throws ApiError
     */
    public static listJournalEntries(
        xOrgId?: string,
        page?: number,
        limit?: number,
    ): CancelablePromise<PaginatedLooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/financial-journal/entries',
            headers: {
                'X-Org-Id': xOrgId,
            },
            query: {
                'page': page,
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get a financial journal entry
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @returns LooseSuccessResponse Journal entry details.
     * @throws ApiError
     */
    public static getJournalEntry(
        id: string,
        xOrgId?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/financial-journal/entries/{id}',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Patch a financial journal entry
     * @param id
     * @param requestBody
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Journal entry updated.
     * @throws ApiError
     */
    public static patchJournalEntry(
        id: string,
        requestBody: Record<string, any>,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/financial-journal/entries/{id}',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Generate insights for a journal entry
     * @param id
     * @param xOrgId Optional organization id to select tenant context.
     * @param xCsrfToken Required for state-changing requests when CSRF is enabled.
     * @returns LooseSuccessResponse Insights generated.
     * @throws ApiError
     */
    public static generateJournalInsights(
        id: string,
        xOrgId?: string,
        xCsrfToken?: string,
    ): CancelablePromise<LooseSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/financial-journal/entries/{id}/insights',
            path: {
                'id': id,
            },
            headers: {
                'X-Org-Id': xOrgId,
                'X-CSRF-Token': xCsrfToken,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
    /**
     * Download media content by GridFS file id
     * @param fileId
     * @param xOrgId Optional organization id to select tenant context.
     * @returns binary Media content stream.
     * @throws ApiError
     */
    public static getMediaByFileId(
        fileId: string,
        xOrgId?: string,
    ): CancelablePromise<Blob> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/media/{fileId}',
            path: {
                'fileId': fileId,
            },
            headers: {
                'X-Org-Id': xOrgId,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                404: `Not found`,
            },
        });
    }
}
