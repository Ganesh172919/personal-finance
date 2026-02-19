/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OrgInviteAccepted } from './OrgInviteAccepted';
import type { OrgMemberStatus } from './OrgMemberStatus';
import type { OrgRole } from './OrgRole';
export type AcceptOrgInviteResponse = {
    invite: OrgInviteAccepted;
    member: (null | {
        id: string;
        org_id: string;
        user_id: string;
        role: OrgRole;
        status: OrgMemberStatus;
    });
    request_id: string;
};

