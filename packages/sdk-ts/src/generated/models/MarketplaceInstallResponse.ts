/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type MarketplaceInstallResponse = {
    org_id: string;
    install: {
        plugin_key: string;
        version: string;
        status: string;
        permissions: Array<string>;
        created_at: (null | string);
        updated_at: (null | string);
    };
    request_id: string;
};

