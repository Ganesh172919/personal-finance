/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BudgetAllocation } from './BudgetAllocation';
import type { PeriodKey } from './PeriodKey';
export type UpsertBudgetAllocationResponse = {
    org_id: string;
    period_key: PeriodKey;
    allocation: BudgetAllocation;
    request_id: string;
};

