/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EntitlementSnapshot } from './EntitlementSnapshot';
import type { OrgRole } from './OrgRole';
export type AppConfigResponse = {
    org: (null | {
        id: string;
        role: OrgRole;
        member_id: string;
        name?: string;
        slug?: string;
        type?: 'personal' | 'team';
        currency?: string;
        locale?: string;
        timezone?: string;
    });
    features: {
        tasks_enabled: boolean;
        receipts_ocr_enabled: boolean;
        journal_enabled: boolean;
        monetization_enabled: boolean;
        csrf_enabled: boolean;
        google_oauth_enabled: boolean;
    };
    entitlements: (null | EntitlementSnapshot);
    request_id: string;
};

