/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type WorkflowActionSendNotification = {
    type: 'send_notification';
    channel?: 'email' | 'in_app';
    subject: string;
    message: string;
};

