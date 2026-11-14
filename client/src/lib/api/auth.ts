/**
 * @fileoverview Authentication API Client
 *
 * Functions for user profile fetching and logout. Login and registration
 * are handled by Passport.js redirects (not API calls).
 *
 * NOTE: The CSRF token and auth status check are handled by AuthContext,
 * not these functions. These are simple wrappers for direct API access.
 *
 * @module lib/api/auth
 */

import { apiClient } from "./core";

import type { AuthUserResponse, LogoutResponse } from "@/types/apiTypes";

// Models the authenticated user profile object stripped of envelope request tracking IDs.
// Represents the pure domain identity data consumed by user state stores and UI headers.
// Omits transient HTTP metadata to provide clean user entity attributes across the client.
/** User profile type (without request_id metadata) */
export type AuthUser = Omit<AuthUserResponse, "request_id">;

// Fetches the active authenticated user profile using ambient secure session cookies.
// Dispatches an HTTP GET request to verify session validity and retrieve account roles.
// Returns the user's profile attributes and permissions for initialization of auth state.
/** Fetch the current user's profile (JWT cookie sent automatically) */
export async function getMyAuthProfile(): Promise<AuthUserResponse> {
  return apiClient("/auth/profile", { method: "GET" });
}

// Terminates the current active session and instructs the server to clear auth cookies.
// Dispatches an HTTP POST request to revoke server-side token state and refresh tokens.
// Confirms session destruction before the frontend redirects the user to the login screen.
/** Log out the current user (server invalidates JWT cookie) */
export async function logout(): Promise<LogoutResponse> {
  return apiClient("/auth/logout", { method: "POST" });
}


