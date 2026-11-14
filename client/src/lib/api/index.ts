/**
 * @fileoverview API Module Barrel Export
 *
 * Re-exports all API modules from a single entry point.
 * Components import from "@/lib/api" or "@/lib/apiClient" to access
 * any API function without knowing the internal file structure.
 *
 * USAGE:
 * import { apiClient, fetchTransactions, getMyConfig } from "@/lib/api";
 *
 * @module lib/api
 */

// Core API client (apiClient, ApiError, fetchCsrfToken)
// Re-exports foundational HTTP transport utilities and error handling classes.
// Exposes the core apiClient wrapper, ApiError abstractions, and CSRF routines.
// Supplies the primary networking infrastructure consumed by all domain clients.
export * from "./core";
// AI processing API
// Re-exports artificial intelligence command processing and session operations.
// Exposes what-if scenario simulations, canary probes, and model catalog endpoints.
// Connects UI features directly to the backend machine learning subsystem.
export * from "./ai";
// Authentication API (login, register, OAuth)
// Re-exports user authentication, session validation, and logout routines.
// Exposes identity profile retrieval and credential invalidation functions.
// Provides client security components access to core authentication state flows.
export * from "./auth";
// App configuration API
// Re-exports application configuration queries and subscription plan catalogs.
// Exposes active user entitlement quotas, feature allowances, and tier limits.
// Informs client feature gating and personalized application preferences.
export * from "./config";
// Transaction CRUD API
// Re-exports ledger transaction CRUD operations and financial records endpoints.
// Exposes category management, bulk CSV importing, and recurring expense tracking.
// Drives primary financial accounting, balance updates, and cash flow charts.
export * from "./transactions";
// User profile API
// Re-exports user financial profile management and onboarding completion services.
// Exposes goals, debts, income parameters, and risk tolerance configurations.
// Powers profile settings forms and baseline financial model personalization.
export * from "./profile";
// Task management API
// Re-exports financial action task management and tracking functionalities.
// Exposes task creation, status updates, due date scheduling, and completions.
// Drives action item checklists and advisory follow-through task boards.
export * from "./tasks";
// Receipt processing API
// Re-exports optical character recognition and automated receipt scanning services.
// Exposes receipt image uploads, extracted merchant parsing, and expense linkages.
// Accelerates manual expense logging by extracting structured data from receipts.
export * from "./receipts";
// Financial journal API
// Re-exports financial journaling and reflective note-taking API capabilities.
// Exposes journal entry creation, historical timelines, and sentiment analysis.
// Enriches numerical accounting records with qualitative context and user notes.
export * from "./journal";
// Chat API (sessions, messages)
// Re-exports conversational AI chat session persistence and message histories.
// Exposes recent agent output feeds, user rating feedback, and suggestion logs.
// Connects interactive chat interfaces to backend conversational reasoning engines.
export * from "./chat";
// Billing and subscription API
// Re-exports subscription management, checkout sessions, and customer portal links.
// Exposes invoice histories, credit booster purchases, and dunning retry commands.
// Integrates client accounting views with payment gateway infrastructure.
export * from "./billing";
// Tool definitions API
// Re-exports agent tool catalog schemas and executable client capabilities.
// Exposes tool definitions that AI agents can invoke with user confirmation.
// Equips client action centers to safely review and execute proposed actions.
export * from "./tools";
// File upload/download API
// Re-exports workspace file management, document analysis, and PDF generation.
// Exposes multi-file uploads, hybrid chunk search, and Document Q&A endpoints.
// Provides document intelligence and file storage capabilities to client views.
export * from "./files";
// Newsletter preferences and delivery API
// Re-exports newsletter subscription preferences and scheduled digest controls.
// Exposes topic interest selections, delivery frequency, and opt-out commands.
// Manages automated financial education digests and periodic summary reports.
export * from "./newsletter";
// Personalized follow-through and ranking API
// Re-exports prioritized recommendation signals and machine learning feedback.
// Exposes signal ranking queries, user action logging, and domain affinities.
// Powers adaptive notification feeds and personalized financial action prioritization.
export * from "./followThrough";
// V1 API modules (platform, finance, analytics, etc.)
// Re-exports versioned enterprise API endpoints spanning multi-tenant features.
// Exposes organization management, analytics rollups, webhooks, and workflows.
// Unifies advanced platform infrastructure under a consolidated namespace.
export * from "./v1";
