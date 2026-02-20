/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CurrencyCode } from './CurrencyCode';
import type { PeriodKey } from './PeriodKey';
export type BudgetAllocation = {
    id: string;
    period_key: PeriodKey;
    category: string;
    amount: number;
    currency: CurrencyCode;
    metadata: Record<string, any>;
    created_at: (null | string);
    updated_at: (null | string);
};

