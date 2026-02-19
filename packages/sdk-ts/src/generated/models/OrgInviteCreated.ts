/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OrgInviteStatus } from './OrgInviteStatus';
import type { OrgRole } from './OrgRole';
export type OrgInviteCreated = {
    id: string;
    email: string;
    role: OrgRole;
    status: OrgInviteStatus;
    expires_at: string;
    token_prefix: string;
    token?: string;
};

