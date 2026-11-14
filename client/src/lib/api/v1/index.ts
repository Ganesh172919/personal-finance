/**
 * @fileoverview V1 API Barrel Export
 *
 * Re-exports every module in the `/v1` API namespace so consumers can
 * import from a single entry point:
 *
 *   import { listAccounts, getSpendingHeatmap, ... } from "@/lib/api/v1";
 *
 * The v1 namespace contains all first-class domain APIs: finance (accounts,
 * merchants, budgets, recurring rules, forecasts), platform (marketplace,
 * plugins, integrations, feature flags), analytics, collaboration (activity
 * feed, comments), organisation management, sharing, and more.
 */

// Re-exports organization management endpoints, membership controls, and settings.
// Exposes organization provisioning, role modifications, and tenant configurations.
// Supplies multi-tenant identity and administration capabilities to client features.
export * from "./orgs";
// Re-exports programmatic API key generation, listing, and revocation functions.
// Exposes scoped authorization tokens enabling third-party developer integrations.
// Powers developer dashboard views for managing external programmatic credentials.
export * from "./apiKeys";
// Re-exports tenant usage metrics, compute consumption, and billing tier quotas.
// Exposes operational metric aggregations and feature allocation telemetry.
// Drives subscription tier progress bars and usage limit warning indicators.
export * from "./usage";
// Re-exports team membership invitation creation, acceptance, and revocation APIs.
// Exposes secure invitation tokens and role assignment workflows for onboarding.
// Facilitates collaborative member additions across organization workspaces.
export * from "./invites";
// Re-exports data export job scheduling, status polling, and binary file downloads.
// Exposes CSV and PDF report generation routines and automated delivery rules.
// Supports compliance backups, spreadsheet exports, and audit data retrieval.
export * from "./exports";
// Re-exports autonomous financial workflow templates, triggers, and execution runs.
// Exposes conditional financial automations, event listeners, and step executions.
// Connects UI workflow builders to backend orchestrators for custom automation.
export * from "./workflows";
// Re-exports marketplace plugin installations, integrations, and feature flags.
// Exposes third-party connector configurations and system runtime capability flags.
// Powers platform extension hubs and dynamic runtime environment toggles.
export * from "./platform";
// Re-exports the four-phase supervised autopilot financial action pipeline.
// Exposes plan generation, sandbox simulation, approval, and live execution APIs.
// Enables autonomous financial management with strict human-in-the-loop validation.
export * from "./autopilot";
// Re-exports secure financial report sharing tokens and access-restricted links.
// Exposes temporary read-only token generation for external advisor collaborations.
// Drives external link generation dialogs and guest view authentication checks.
export * from "./shares";
// Re-exports user referral code generation, referral tracking, and rewards claims.
// Exposes referral statistics, invitation redemption codes, and credited discounts.
// Powers viral growth referral dashboards and customer reward redemption interfaces.
export * from "./referrals";
// Re-exports core financial domain APIs covering accounts, merchants, and budgets.
// Exposes budget envelopes, recurring transaction rules, and cash flow forecasts.
// Serves as the primary financial modeling engine powering the application core.
export * from "./finance";
// Re-exports notification preference settings, in-app alerts, and message streams.
// Exposes read receipts, push channel configurations, and priority alert filters.
// Drives notification center trays, unread badge counters, and alert banners.
export * from "./notifications";
// Re-exports spending heatmap calculations, category trend series, and net worth views.
// Exposes multi-currency valuations, income-expense ratios, and merchant rankings.
// Powers visual financial analytics charts, trend graphs, and executive dashboards.
export * from "./analytics";
// Re-exports organization activity stream events and contextual comment threads.
// Exposes timeline cursor pagination, comment threading, and team mentions.
// Facilitates collaborative team auditing and discussions across financial entities.
export * from "./collaboration";
