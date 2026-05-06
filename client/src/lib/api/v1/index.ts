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

export * from "./orgs";
export * from "./apiKeys";
export * from "./usage";
export * from "./invites";
export * from "./exports";
export * from "./workflows";
export * from "./platform";
export * from "./autopilot";
export * from "./shares";
export * from "./referrals";
export * from "./finance";
export * from "./notifications";
export * from "./analytics";
export * from "./collaboration";
