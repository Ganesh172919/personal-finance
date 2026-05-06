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

/** User profile type (without request_id metadata) */
export type AuthUser = Omit<AuthUserResponse, "request_id">;

/** Fetch the current user's profile (JWT cookie sent automatically) */
export async function getMyAuthProfile(): Promise<AuthUserResponse> {
  return apiClient("/auth/profile", { method: "GET" });
}

/** Log out the current user (server invalidates JWT cookie) */
export async function logout(): Promise<LogoutResponse> {
  return apiClient("/auth/logout", { method: "POST" });
}


