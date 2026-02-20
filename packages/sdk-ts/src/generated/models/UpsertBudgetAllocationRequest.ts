/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CurrencyCode } from './CurrencyCode';
export type UpsertBudgetAllocationRequest = {
    category: string;
    amount: number;
    currency?: CurrencyCode;
    metadata?: Record<string, any>;
};

