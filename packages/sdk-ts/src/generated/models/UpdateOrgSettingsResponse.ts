/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type UpdateOrgSettingsResponse = {
    org: {
        id: string;
        name: string;
        slug: string;
        type: 'personal' | 'team';
        currency: string;
        locale: string;
        timezone: string;
    };
    request_id: string;
};

