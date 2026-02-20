/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type TransactionsCsvImportRequest = {
    file: Blob;
    mapping: {
        amount: string;
        date: string;
        description?: string;
        category?: string;
        type?: string;
        merchant?: string;
    };
    account_id?: string;
    dry_run?: boolean;
};

