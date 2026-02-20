/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RecurringRuleStatus } from './RecurringRuleStatus';
export type CreateRecurringRuleRequest = {
    name: string;
    cron: string;
    status?: RecurringRuleStatus;
    merchant_id?: string;
    merchant_name?: string;
    category?: string;
    amount_min?: number;
    amount_max?: number;
    next_run_at?: string;
    metadata?: Record<string, any>;
};

