/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RecurringRuleSuggestion } from './RecurringRuleSuggestion';
export type RecurringCandidate = {
    candidate_id: string;
    cadence: 'weekly' | 'monthly';
    confidence: number;
    occurrences: number;
    first_seen_at: string;
    last_seen_at: string;
    interval_days_median: number;
    amount_avg: number;
    amount_min: number;
    amount_max: number;
    amount_range_pct: number;
    category: string;
    merchant_id: (null | string);
    merchant_name: (null | string);
    description_sample: string;
    suggested_cron: string;
    suggested_rule: RecurringRuleSuggestion;
    rationale: Array<string>;
};

