/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PluginsListResponse = {
    org_id: string;
    plugins: Array<{
        plugin_key: string;
        name: string;
        publisher: string;
        version: string;
        status: string;
        permissions: Array<string>;
        created_at: (null | string);
        updated_at: (null | string);
    }>;
    request_id: string;
};

