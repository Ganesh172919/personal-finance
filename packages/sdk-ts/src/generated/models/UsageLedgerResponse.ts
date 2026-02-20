/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EntitlementCredits } from './EntitlementCredits';
import type { PlanLimit } from './PlanLimit';
import type { PlanTier } from './PlanTier';
import type { UsageLedgerRow } from './UsageLedgerRow';
export type UsageLedgerResponse = {
    org_id: string;
    period_key: string;
    plan: PlanTier;
    status: string;
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
    ledger: Array<UsageLedgerRow>;
    request_id: string;
};

