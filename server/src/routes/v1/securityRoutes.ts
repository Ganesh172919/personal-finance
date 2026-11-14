/**
 * @fileoverview Security routes covering two-factor authentication, security audit
 * logs (user and org), and API key management.
 *
 * Endpoints:
 *   POST /auth/2fa/setup              - Set up 2FA
 *   POST /auth/2fa/verify             - Verify a 2FA code
 *   POST /auth/2fa/disable            - Disable 2FA
 *   GET  /auth/2fa/status             - Get 2FA status
 *   GET  /security/audit-log          - Get user security audit log
 *   GET  /orgs/audit-log              - Get org security audit log
 *   GET  /api-keys                    - List API keys
 *   POST /api-keys                    - Create an API key
 *   POST /api-keys/:id/revoke         - Revoke an API key
 *
 * Middleware:
 *   - Passport JWT authentication on all endpoints
 *   - Zod validation on params and body per endpoint
 *
 * Controllers: twoFactorController, auditController, apiKeyController
 */
import { Router } from "express";
import passport from "passport";

import { validate } from "../../middleware/validate";
import { asyncRoute } from "../../utils/asyncRoute";
import { objectIdSchema } from "../../schemas/common";
import { createApiKeyBodySchema } from "../../schemas/v1/apiKeySchemas";
import { verify2FABodySchema, disable2FABodySchema } from "../../schemas/v1/twoFactorSchemas";
import {
  createApiKeyForOrg,
  listApiKeys,
  revokeApiKey,
} from "../../controllers/v1/apiKeyController";
import { getUserSecurityAuditLog, getOrgSecurityAuditLog } from "../../controllers/v1/auditController";
import {
  setup2FA,
  verify2FA,
  disable2FA,
  get2FAStatus,
} from "../../controllers/v1/twoFactorController";

// Initializes an Express router instance dedicated to identity and application security.
// Groups two-factor authentication, organization audit logging, and API key management routes.
// Enforces strict authentication and payload validation across all defensive security controls.
const router = Router();

// ─── Two-Factor Authentication ────────────────────────────
// Initiates time-based one-time password (TOTP) two-factor authentication provisioning.
// Requires an active JWT user session to generate a secure secret seed and QR code data URL.
// Dispatches secret generation to the setup2FA controller wrapped with asyncRoute.
router.post(
  "/auth/2fa/setup",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(setup2FA),
);
// Verifies and activates a pending two-factor authentication enrollment using a submitted TOTP code.
// Validates the 6-digit numeric token payload against verify2FABodySchema before confirming activation.
// Invokes verify2FA to record confirmed 2FA status and generate backup recovery codes.
router.post(
  "/auth/2fa/verify",
  passport.authenticate("jwt", { session: false }),
  validate({ body: verify2FABodySchema }),
  asyncRoute(verify2FA),
);
// Disables two-factor authentication on the active user account following explicit code verification.
// Validates the submission against disable2FABodySchema requiring password or current OTP confirmation.
// Dispatches deactivation to the disable2FA controller to revoke TOTP credentials.
router.post(
  "/auth/2fa/disable",
  passport.authenticate("jwt", { session: false }),
  validate({ body: disable2FABodySchema }),
  asyncRoute(disable2FA),
);
// Returns the current two-factor authentication operational state for the signed-in user.
// Checks whether TOTP enforcement is active and reports remaining backup codes count.
// Invokes get2FAStatus to provide security status indicators to the user profile interface.
router.get(
  "/auth/2fa/status",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(get2FAStatus),
);

// ─── Security Audit Logs ─────────────────────────────────
// Fetches chronological security events and access logs associated with the authenticated user.
// Enforces JWT session validation and queries audit logs for logins, token refreshes, and password changes.
// Dispatches retrieval to getUserSecurityAuditLog with standardized error trapping.
router.get(
  "/security/audit-log",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getUserSecurityAuditLog),
);
// Retrieves tenant-wide administrative and security audit events for the active organization.
// Requires valid JWT credentials and tenant membership authorization before returning logs.
// Invokes getOrgSecurityAuditLog to populate organization compliance and security audit trails.
router.get(
  "/orgs/audit-log",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getOrgSecurityAuditLog),
);

// ─── API Keys ────────────────────────────────────────────
// Lists all active and revoked API keys provisioned for the user's current organization.
// Enforces JWT authentication to guarantee that sensitive programmatic keys are accessed securely.
// Delegates key inventory lookup to listApiKeys for frontend developer settings rendering.
router.get(
  "/api-keys",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listApiKeys),
);
// Generates and provisions a new cryptographically secure API key for programmatic system integration.
// Validates requested permission scopes, expiration terms, and key label via createApiKeyBodySchema.
// Executes createApiKeyForOrg to store the hashed key and return the raw secret token once.
router.post(
  "/api-keys",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createApiKeyBodySchema }),
  asyncRoute(createApiKeyForOrg),
);
// Revokes an existing API key immediately terminating its access privileges across all endpoints.
// Validates the target key ObjectId parameter and checks organizational ownership permissions.
// Dispatches revocation to revokeApiKey to update revocation timestamps and invalidate caches.
router.post(
  "/api-keys/:id/revoke",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(revokeApiKey),
);

export default router;
