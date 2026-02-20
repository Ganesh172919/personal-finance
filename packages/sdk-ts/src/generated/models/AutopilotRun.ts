/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AutopilotRunStatus } from './AutopilotRunStatus';
import type { ToolCall } from './ToolCall';
export type AutopilotRun = {
    id: string;
    goal: string;
    status: AutopilotRunStatus;
    ai: Record<string, any>;
    tool_calls: Array<ToolCall>;
    simulations: Array<Record<string, any>>;
    approvals: Record<string, any>;
    executions: Array<Record<string, any>>;
    error: (null | string);
    created_at: (null | string);
    updated_at: (null | string);
};

