/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TransactionType } from './TransactionType';
export type TransactionsCsvExportParams = {
    /**
     * ISO date or datetime string.
     */
    date_from?: string;
    /**
     * ISO date or datetime string.
     */
    date_to?: string;
    tx_type?: TransactionType;
    category?: string;
};

