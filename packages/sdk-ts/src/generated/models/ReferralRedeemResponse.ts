/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ReferralRedeemResponse = {
    org_id: string;
    applied: boolean;
    reason: string;
    redemption_id: string;
    referrer_org_id: string;
    reward: {
        periods: Array<string>;
        unitsByFeature: Record<string, any>;
    };
    request_id: string;
};

