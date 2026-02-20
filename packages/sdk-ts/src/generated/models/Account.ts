/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AccountStatus } from './AccountStatus';
import type { AccountType } from './AccountType';
import type { CurrencyCode } from './CurrencyCode';
export type Account = {
    id: string;
    name: string;
    institution: (null | string);
    type: AccountType;
    currency: CurrencyCode;
    mask: (null | string);
    status: AccountStatus;
    metadata: Record<string, any>;
    created_at: (null | string);
    updated_at: (null | string);
};

