/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OrgRole } from './OrgRole';
export type OrgsMeResponse = {
    active_org: (null | {
        id: string;
        role: OrgRole;
        member_id: string;
    });
    orgs: Array<{
        id: string;
        name: string;
        slug: string;
        type: 'personal' | 'team';
        currency: string;
        locale: string;
        timezone: string;
        role: OrgRole;
        is_default: boolean;
    }>;
    request_id: string;
};

