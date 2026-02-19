/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiKeyScope } from './ApiKeyScope';
export type ListApiKeysResponse = {
    api_keys: Array<{
        id: string;
        name: string;
        prefix: string;
        scopes: Array<ApiKeyScope>;
        created_at: string;
        last_used_at: (null | string);
        revoked_at: (null | string);
    }>;
    request_id: string;
};

