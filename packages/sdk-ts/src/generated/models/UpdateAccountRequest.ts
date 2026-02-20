/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AccountStatus } from './AccountStatus';
import type { AccountType } from './AccountType';
import type { CurrencyCode } from './CurrencyCode';
export type UpdateAccountRequest = {
    name?: string;
    institution?: string;
    type?: AccountType;
    currency?: CurrencyCode;
    mask?: string;
    status?: AccountStatus;
    metadata?: Record<string, any>;
};

