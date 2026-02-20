/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CurrencyCode } from './CurrencyCode';
import type { ForecastCategoryRow } from './ForecastCategoryRow';
import type { PeriodKey } from './PeriodKey';
export type ForecastResponse = {
    org_id: string;
    currency: CurrencyCode;
    period_key: PeriodKey;
    months: number;
    baseline: {
        days_covered: number;
        income_monthly_avg: number;
        expense_monthly_avg: number;
        net_monthly_avg: number;
    };
    recurring_rules: {
        active_rules: number;
        expense_expected_monthly: number;
        by_category: Array<{
            category: string;
            expense_expected_monthly: number;
        }>;
    };
    top_categories: Array<ForecastCategoryRow>;
    projection: Array<{
        period_key: PeriodKey;
        income: number;
        expense: number;
        net: number;
    }>;
    request_id: string;
};

