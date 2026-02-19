/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WorkflowRunResult } from './WorkflowRunResult';
export type WorkflowRun = {
    id: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed';
    started_at: (null | string);
    finished_at: (null | string);
    result: (null | WorkflowRunResult);
    error: (null | string);
};

