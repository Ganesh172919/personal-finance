/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UsageFeature } from './UsageFeature';
export type UsageLedgerRow = {
    feature: UsageFeature;
    units: number;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    updated_at: (null | string);
};

