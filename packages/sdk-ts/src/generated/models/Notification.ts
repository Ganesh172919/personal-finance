/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NotificationStatus } from './NotificationStatus';
export type Notification = {
    id: string;
    status: NotificationStatus;
    title: string;
    message: string;
    read_at: (null | string);
    created_at: (null | string);
    metadata: Record<string, any>;
};

