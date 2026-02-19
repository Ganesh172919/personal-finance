/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type MarketplaceCatalogResponse = {
    org_id: string;
    plugins: Array<{
        plugin_key: string;
        name: string;
        description: string;
        publisher: string;
        status: 'active' | 'preview' | 'deprecated';
        latest_version: string;
        available_versions: Array<string>;
        permissions: Array<string>;
        pricing_model: 'free' | 'paid';
        price_monthly_usd: (null | number);
        installed: boolean;
        installed_version: (null | string);
        installed_status: (null | string);
        installed_updated_at: (null | string);
    }>;
    request_id: string;
};

