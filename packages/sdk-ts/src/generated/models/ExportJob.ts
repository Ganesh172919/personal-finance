/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ExportJobStatus } from './ExportJobStatus';
import type { ExportJobType } from './ExportJobType';
export type ExportJob = {
    id: string;
    type: ExportJobType;
    status: ExportJobStatus;
    params: Record<string, any>;
    filename?: string;
    content_type?: string;
    bytes?: number;
    started_at?: string;
    finished_at?: string;
    error?: string;
    created_at?: string;
    updated_at?: string;
};

