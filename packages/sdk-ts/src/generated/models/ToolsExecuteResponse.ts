/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ToolsExecuteResponse = {
    ok: boolean;
    tool_execution_id: string;
    tool_call_id: string;
    tool: string;
    idempotency_key: string;
    idempotent_replay: boolean;
    result: Record<string, any>;
    request_id: string;
};

