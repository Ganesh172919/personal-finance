/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type IntegrationSyncResponse = {
    org_id: string;
    queued: boolean;
    run: {
        id: string;
        connector_key: string;
        status: 'queued' | 'running' | 'succeeded' | 'failed';
        records_synced: number;
        started_at: (null | string);
        finished_at: (null | string);
        error: (null | string);
    };
    request_id: string;
};

