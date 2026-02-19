/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ReferralsMeResponse = {
    org_id: string;
    referral_code: string;
    share_url: string;
    redemptions_count: number;
    referred_by?: (null | {
        referral_code: string;
        redeemed_at?: string;
    });
    reward: {
        months: number;
        units: {
            monthly_ai_calls: number;
            api_requests: number;
            workflow_runs: number;
            marketplace_installs: number;
        };
    };
    request_id: string;
};

