/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RecurringRuleStatus } from './RecurringRuleStatus';
export type RecurringRule = {
    id: string;
    status: RecurringRuleStatus;
    name: string;
    cron: string;
    merchant_id: (null | string);
    merchant_name: (null | string);
    category: (null | string);
    amount_min: (null | number);
    amount_max: (null | number);
    next_run_at: (null | string);
    metadata: Record<string, any>;
    created_at: (null | string);
    updated_at: (null | string);
};

