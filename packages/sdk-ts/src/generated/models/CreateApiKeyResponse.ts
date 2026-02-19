/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiKeyScope } from './ApiKeyScope';
export type CreateApiKeyResponse = {
    /**
     * Secret API key value (only returned once).
     */
    api_key: string;
    key: {
        id: string;
        prefix: string;
        name: string;
        scopes: Array<ApiKeyScope>;
        created_at: string;
    };
    request_id: string;
};

