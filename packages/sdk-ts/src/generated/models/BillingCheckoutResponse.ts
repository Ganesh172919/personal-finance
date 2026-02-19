/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BillingProvider } from './BillingProvider';
export type BillingCheckoutResponse = {
    provider: BillingProvider;
    checkout_url: (null | string);
    activated: boolean;
    session_id?: string;
    request_id: string;
};

