import { apiClient } from "./core";

import type { AuthUserResponse, LogoutResponse } from "@finwise/sdk-ts";

export type AuthUser = Omit<AuthUserResponse, "request_id">;

export async function getMyAuthProfile(): Promise<AuthUserResponse> {
  return apiClient("/auth/profile", { method: "GET" });
}

export async function logout(): Promise<LogoutResponse> {
  return apiClient("/auth/logout", { method: "POST" });
}
