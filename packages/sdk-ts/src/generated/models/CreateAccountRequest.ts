/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AccountType } from './AccountType';
import type { CurrencyCode } from './CurrencyCode';
export type CreateAccountRequest = {
    name: string;
    institution?: string;
    type?: AccountType;
    currency?: CurrencyCode;
    mask?: string;
    metadata?: Record<string, any>;
};

