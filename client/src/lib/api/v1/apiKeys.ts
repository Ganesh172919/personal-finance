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

export type ApiKeyScope = SdkApiKeyScope;
/** Extracted item type from the list response for convenience. */
export type ApiKeyListItem = ListApiKeysResponse["api_keys"][number];

/** List all API keys for the active organisation. */
export async function listApiKeys(): Promise<ListApiKeysResponse> {
  return apiClient("/v1/api-keys");
}

/** Create a new API key. The response includes the full token (shown only once). */
export async function createApiKey(body: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
  return apiClient("/v1/api-keys", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Revoke (soft-delete) an API key, making it immediately unusable. */
export async function revokeApiKey(id: string): Promise<RevokeApiKeyResponse> {
  return apiClient(`/v1/api-keys/${id}/revoke`, { method: "POST" });
}


