/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EntitlementCredits } from './EntitlementCredits';
import type { EntitlementStatus } from './EntitlementStatus';
import type { PlanLimit } from './PlanLimit';
import type { PlanTier } from './PlanTier';
export type EntitlementsMeResponse = {
    org_id?: string;
    plan: PlanTier;
    status: EntitlementStatus;
    base_limits: PlanLimit;
    credits: EntitlementCredits;
    limits: PlanLimit;
    usage: {
        monthly_ai_calls: number;
        scenario_depth: number;
        ocr_quota: number;
        export_access: number;
        api_requests: number;
        autopilot_actions: number;
        workflow_runs: number;
        connector_sync_records: number;
        marketplace_installs: number;
    };
    remaining: PlanLimit;
    period_key: string;
    request_id: string;
};

