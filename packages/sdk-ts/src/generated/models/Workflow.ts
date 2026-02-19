/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WorkflowAction } from './WorkflowAction';
import type { WorkflowTrigger } from './WorkflowTrigger';
export type Workflow = {
    id: string;
    name: string;
    enabled: boolean;
    trigger: WorkflowTrigger;
    actions: Array<WorkflowAction>;
    created_at: string;
    updated_at: string;
};

