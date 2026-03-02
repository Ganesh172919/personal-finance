import { apiClient } from "./core";

// ─── Types ────────────────────────────────────────────────

export type TwoFactorSetupResponse = {
  secret: string;
  uri: string;
  message?: string;
  request_id?: string;
};

export type TwoFactorVerifyRequest = {
  token: string;
};

export type TwoFactorVerifyResponse = {
  enabled: boolean;
  backup_codes: string[];
  message?: string;
  request_id?: string;
};

export type TwoFactorDisableRequest = {
  token: string;
};

export type TwoFactorDisableResponse = {
  enabled: boolean;
  message?: string;
  request_id?: string;
};

export type TwoFactorStatusResponse = {
  enabled: boolean;
  request_id?: string;
};

export type UpdateProfileRequest = {
  name?: string;
  email?: string;
  phoneNumber?: string;
};

export type UpdateProfileResponse = {
  user?: any;
  message?: string;
  request_id?: string;
};

export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResponse = {
  success: boolean;
  message?: string;
  request_id?: string;
};

// ─── Two-Factor Authentication ────────────────────────────

export async function setup2FA(): Promise<TwoFactorSetupResponse> {
  return apiClient("/v1/auth/2fa/setup", { method: "POST" });
}

export async function verify2FA(token: string): Promise<TwoFactorVerifyResponse> {
  return apiClient("/v1/auth/2fa/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function disable2FA(token: string): Promise<TwoFactorDisableResponse> {
  return apiClient("/v1/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function get2FAStatus(): Promise<TwoFactorStatusResponse> {
  return apiClient("/v1/auth/2fa/status", { method: "GET" });
}

// ─── Profile Management ───────────────────────────────────

export async function updateProfile(data: UpdateProfileRequest): Promise<UpdateProfileResponse> {
  return apiClient("/auth/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function changePassword(data: ChangePasswordRequest): Promise<ChangePasswordResponse> {
  return apiClient("/auth/password", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
