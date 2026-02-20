/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BudgetEnvelopeRow } from './BudgetEnvelopeRow';
import type { BudgetEnvelopesTotals } from './BudgetEnvelopesTotals';
import type { CurrencyCode } from './CurrencyCode';
import type { PeriodKey } from './PeriodKey';
export type BudgetEnvelopesResponse = {
    org_id: string;
    period_key: PeriodKey;
    currency: CurrencyCode;
    totals: BudgetEnvelopesTotals;
    envelopes: Array<BudgetEnvelopeRow>;
    request_id: string;
};

