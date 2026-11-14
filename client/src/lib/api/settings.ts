import { apiClient } from "./core";

// ─── Types ────────────────────────────────────────────────

// Defines the initialization payload returned during two-factor authentication setup.
// Provides the generated TOTP secret key and registration URI for QR code generation.
// Enables authenticator application pairing on the user device during 2FA onboarding.
export type TwoFactorSetupResponse = {
  secret: string;
  uri: string;
  message?: string;
  request_id?: string;
};

// Defines the parameter contract for verifying a time-based one-time authentication token.
// Delivers the temporary six-digit security passcode entered by the user.
// Validates authenticator device ownership to activate multi-factor account protection.
export type TwoFactorVerifyRequest = {
  token: string;
};

// Represents the confirmation payload produced after successful 2FA token verification.
// Indicates whether two-factor security is activated and provides one-time backup recovery codes.
// Allows users to preserve emergency recovery codes in case their authenticator device is lost.
export type TwoFactorVerifyResponse = {
  enabled: boolean;
  backup_codes: string[];
  message?: string;
  request_id?: string;
};

// Represents the payload necessary to deactivate two-factor authentication on an account.
// Requires the user to provide a current TOTP token or security code as proof of authorization.
// Prevents unauthorized deactivation of account multi-factor protection credentials.
export type TwoFactorDisableRequest = {
  token: string;
};

// Encapsulates the response returned when two-factor authentication has been disabled.
// Reflects updated account protection status and delivers an operational feedback message.
// Informs client workflows that multi-factor challenges will no longer be demanded on login.
export type TwoFactorDisableResponse = {
  enabled: boolean;
  message?: string;
  request_id?: string;
};

// Reports the current status of two-factor authentication for the authenticated user.
// Supplies a boolean flag indicating whether TOTP verification is actively required.
// Drives conditional security toggles and warning banners across user settings panels.
export type TwoFactorStatusResponse = {
  enabled: boolean;
  request_id?: string;
};

// Defines editable profile attributes submitted during user account modification requests.
// Supports selective updates for user full name, contact email, and telephone number.
// Validates personal demographic parameters prior to persisting user record changes.
export type UpdateProfileRequest = {
  name?: string;
  email?: string;
  phoneNumber?: string;
};

// Encapsulates the server response returned after modifying user profile demographics.
// Delivers the updated user profile record alongside status feedback confirmations.
// Updates local account state caches and visual profile header representations.
export type UpdateProfileResponse = {
  user?: any;
  message?: string;
  request_id?: string;
};

// Defines parameters required to update user account authentication passwords.
// Supplies the current active password for verification alongside the requested replacement.
// Enforces security credential rotation rules during authenticated settings operations.
export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

// Encapsulates the result payload received following a password change request.
// Confirms whether the password update was successfully validated and committed.
// Prompts client interface notices informing the user to re-authenticate if necessary.
export type ChangePasswordResponse = {
  success: boolean;
  message?: string;
  request_id?: string;
};

// ─── Two-Factor Authentication ────────────────────────────

// Initiates the two-factor authentication provisioning flow for the user account.
// Dispatches an authenticated POST request generating a new TOTP secret and QR URI.
// Returns provisioning parameters to render authenticator configuration dialogs.
export async function setup2FA(): Promise<TwoFactorSetupResponse> {
  return apiClient("/auth/2fa/setup", { method: "POST" });
}

// Validates a user-submitted TOTP passcode to complete two-factor authentication enrollment.
// Dispatches an authenticated POST request delivering the verification token to the server.
// Returns activation status and emergency recovery codes upon successful confirmation.
export async function verify2FA(token: string): Promise<TwoFactorVerifyResponse> {
  return apiClient("/auth/2fa/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

// Deactivates two-factor authentication for the currently authenticated user account.
// Dispatches an authenticated POST request with the required confirmation token payload.
// Returns updated 2FA status confirming that multi-factor checks have been removed.
export async function disable2FA(token: string): Promise<TwoFactorDisableResponse> {
  return apiClient("/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

// Queries the current two-factor authentication enrollment state for the user.
// Dispatches an authenticated GET request inspecting active multi-factor configuration.
// Returns boolean status flags to initialize security settings toggles in the UI.
export async function get2FAStatus(): Promise<TwoFactorStatusResponse> {
  return apiClient("/auth/2fa/status", { method: "GET" });
}

// ─── Profile Management ───────────────────────────────────

// Submits modified user demographic information to update account profile attributes.
// Dispatches an authenticated PUT request with sanitized name, email, and phone values.
// Returns the refreshed user profile entity to sync global client state stores.
export async function updateProfile(data: UpdateProfileRequest): Promise<UpdateProfileResponse> {
  return apiClient("/auth/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// Updates the authenticated user's account password after validating current credentials.
// Dispatches an authenticated POST request transmitting current and replacement passwords.
// Returns success indicators enabling the UI to confirm credential rotation completion.
export async function changePassword(data: ChangePasswordRequest): Promise<ChangePasswordResponse> {
  return apiClient("/auth/password", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
