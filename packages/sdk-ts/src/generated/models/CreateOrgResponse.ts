/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OrgRole } from './OrgRole';
export type CreateOrgResponse = {
    org: {
        id: string;
        slug: string;
        name: string;
        type: 'team';
        currency: string;
        locale: string;
        timezone: string;
        role: OrgRole;
    };
    request_id: string;
};

