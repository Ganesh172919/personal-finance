/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EntitlementStatus } from './EntitlementStatus';
import type { PlanLimit } from './PlanLimit';
import type { PlanTier } from './PlanTier';
export type AnalyticsOverviewResponse = {
    org_id: string;
    period_key: string;
    plan: PlanTier;
    status: EntitlementStatus;
    metrics: {
        active_workflows: number;
        workflow_runs_30d: number;
        exports_30d: number;
        connected_integrations: number;
        installed_plugins: number;
        feature_flags: number;
    };
    usage: Record<string, {
        units: number;
        tokens_in: number;
        tokens_out: number;
        cost_usd: number;
    }>;
    limits: PlanLimit;
    remaining: PlanLimit;
    request_id: string;
};

