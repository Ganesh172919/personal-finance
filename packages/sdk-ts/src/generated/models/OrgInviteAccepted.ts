/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OrgInviteStatus } from './OrgInviteStatus';
import type { OrgRole } from './OrgRole';
export type OrgInviteAccepted = {
    id: string;
    org_id: string;
    email: string;
    role: OrgRole;
    status: OrgInviteStatus;
    accepted_at?: string;
};

