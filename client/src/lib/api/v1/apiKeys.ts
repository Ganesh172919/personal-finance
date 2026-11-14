/**
 * @fileoverview V1 API Key Management
 *
 * Manages API keys that allow programmatic access to the platform.
 * Keys can be scoped to specific permissions and are created/revoked
 * per organisation.
 *
 * Key concepts:
 * - **API Key Scopes**: Keys are assigned a scope that controls which
 *   endpoints they can access (e.g., read-only, full access).
 * - **Revocation**: Keys can be revoked (soft-deleted) via a POST to
 *   the `/revoke` endpoint. Revoked keys are immediately unusable.
 * - **One-time Token**: The `createApiKey` response includes the full
 *   key token which is only shown once at creation time.
 */

import { apiClient } from "../core";

import type {
  ApiKeyScope as SdkApiKeyScope,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  ListApiKeysResponse,
  RevokeApiKeyResponse,
} from "@/types/apiTypes";

// Alias for API key permission scopes defined in the core SDK contracts.
// Governs endpoint access permissions such as read-only or read-write rights.
// Restricts programmatic integration capabilities to defined operational boundaries.
export type ApiKeyScope = SdkApiKeyScope;

// Extracts the individual API key model structure from list response collections.
// Captures key identifiers, masked tokens, creation dates, and assigned scopes.
// Drives tabular rows rendering existing API keys in developer settings panels.
/** Extracted item type from the list response for convenience. */
export type ApiKeyListItem = ListApiKeysResponse["api_keys"][number];

// Retrieves all active and revoked API keys issued under the active organization.
// Dispatches an authenticated GET request fetching the organization's key metadata.
// Powers developer settings dashboards displaying programmatic access tokens.
/** List all API keys for the active organisation. */
export async function listApiKeys(): Promise<ListApiKeysResponse> {
  return apiClient("/api-keys");
}

// Provisions a new programmatic API key configured with designated scopes and labels.
// Dispatches an authenticated POST request delivering key configuration parameters.
// Returns the plaintext secret token which is surfaced only once to the developer.
/** Create a new API key. The response includes the full token (shown only once). */
export async function createApiKey(body: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
  return apiClient("/api-keys", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Permanently deactivates an existing programmatic API key identified by ID.
// Dispatches an authenticated POST request triggering immediate token invalidation.
// Prevents any further external API requests utilizing the revoked credentials.
/** Revoke (soft-delete) an API key, making it immediately unusable. */
export async function revokeApiKey(id: string): Promise<RevokeApiKeyResponse> {
  return apiClient(`/api-keys/${id}/revoke`, { method: "POST" });
}


