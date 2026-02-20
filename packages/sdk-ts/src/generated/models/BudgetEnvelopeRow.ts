/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CurrencyCode } from './CurrencyCode';
export type BudgetEnvelopeRow = {
    category: string;
    planned: number;
    spent: number;
    remaining: number;
    currency: CurrencyCode;
    tx_count: number;
    unbudgeted: boolean;
};

