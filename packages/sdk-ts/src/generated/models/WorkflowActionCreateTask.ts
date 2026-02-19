/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TaskKind } from './TaskKind';
import type { TaskPriority } from './TaskPriority';
export type WorkflowActionCreateTask = {
    type: 'create_task';
    bucket: 7 | 30 | 365;
    title: string;
    why: string;
    steps?: Array<string>;
    priority?: TaskPriority;
    expected_impact: string;
    kind?: TaskKind;
    due_days?: number;
};

