/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type IntegrationsListResponse = {
    org_id: string;
    connectors: Array<{
        connector_key: string;
        name: string;
        category: string;
        supports_webhook: boolean;
        stub_mode: boolean;
        status: string;
        last_sync_at: (null | string);
        last_error: (null | string);
        metadata: Record<string, any>;
        updated_at: (null | string);
    }>;
    request_id: string;
};

