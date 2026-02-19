import { apiClient } from "../core";

import type {
  ApiKeyScope as SdkApiKeyScope,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  ListApiKeysResponse,
  RevokeApiKeyResponse,
} from "@finwise/sdk-ts";

export type ApiKeyScope = SdkApiKeyScope;
export type ApiKeyListItem = ListApiKeysResponse["api_keys"][number];

export async function listApiKeys(): Promise<ListApiKeysResponse> {
  return apiClient("/v1/api-keys");
}

export async function createApiKey(body: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
  return apiClient("/v1/api-keys", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function revokeApiKey(id: string): Promise<RevokeApiKeyResponse> {
  return apiClient(`/v1/api-keys/${id}/revoke`, { method: "POST" });
}
