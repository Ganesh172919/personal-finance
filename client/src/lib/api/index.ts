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
export * from "./core";
// AI processing API
export * from "./ai";
// Authentication API (login, register, OAuth)
export * from "./auth";
// App configuration API
export * from "./config";
// Transaction CRUD API
export * from "./transactions";
// User profile API
export * from "./profile";
// Task management API
export * from "./tasks";
// Receipt processing API
export * from "./receipts";
// Financial journal API
export * from "./journal";
// Chat API (sessions, messages)
export * from "./chat";
// Billing and subscription API
export * from "./billing";
// Tool definitions API
export * from "./tools";
// File upload/download API
export * from "./files";
// V1 API modules (platform, finance, analytics, etc.)
export * from "./v1";
