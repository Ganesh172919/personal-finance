/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ToolRisk } from './ToolRisk';
export type ToolCall = {
    id: string;
    title: string;
    description: string;
    requires_confirmation: boolean;
    risk: ToolRisk;
    tool: string;
    args: Record<string, any>;
};

