/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OrgInviteCreated } from './OrgInviteCreated';
import type { OrgMember } from './OrgMember';
export type AddOrgMemberResponse = {
    org: {
        id: string;
        name: string;
        slug: string;
    };
    member: (null | OrgMember);
    invite: (null | OrgInviteCreated);
    request_id: string;
};

