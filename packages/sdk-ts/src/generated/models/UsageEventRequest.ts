/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UsageFeature } from './UsageFeature';
export type UsageEventRequest = {
    org_id?: string;
    user_id: string;
    feature: UsageFeature;
    units: number;
    idempotency_key?: string;
    context?: Record<string, any>;
};

