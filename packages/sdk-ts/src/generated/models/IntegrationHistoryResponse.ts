/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type IntegrationHistoryResponse = {
    org_id: string;
    connector_key: string;
    history: Array<{
        id: string;
        status: string;
        records_synced: number;
        started_at: (null | string);
        finished_at: (null | string);
        error: (null | string);
        request_id: (null | string);
        created_at: (null | string);
    }>;
    request_id: string;
};

