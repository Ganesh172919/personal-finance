/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type FinancialStorySharePayload = {
    type: 'financial_story';
    generated_at: string;
    currency?: (null | string);
    locale?: (null | string);
    timezone?: (null | string);
    summary: {
        health_percentage: number;
        total_assets: number;
        savings_balance: number;
        goals_active: number;
        milestones_count: number;
    };
    goals: Array<{
        name: string;
        target: number;
        current: number;
        deadline?: (null | string);
        priority: number;
    }>;
    milestones: Array<{
        agent_type: string;
        title: string;
        description: string;
        timestamp: string;
    }>;
    profile_updated_at?: (null | string);
};

