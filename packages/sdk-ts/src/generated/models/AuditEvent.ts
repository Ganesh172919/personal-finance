/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuditActorType } from './AuditActorType';
export type AuditEvent = {
    id: string;
    actor_type: AuditActorType;
    actor_user_id?: string;
    actor_api_key_id?: string;
    action: string;
    target_type: string;
    target_id?: string;
    request_id?: string;
    metadata: Record<string, any>;
    created_at: string;
};

