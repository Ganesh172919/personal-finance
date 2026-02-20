/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ToolCall } from './ToolCall';
export type ToolsExecuteRequest = {
    tool_call: ToolCall;
    confirm?: boolean;
    idempotency_key?: string;
};

