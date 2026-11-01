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

const router = Router();

// ─── Two-Factor Authentication ────────────────────────────
router.post(
  "/auth/2fa/setup",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(setup2FA),
);
router.post(
  "/auth/2fa/verify",
  passport.authenticate("jwt", { session: false }),
  validate({ body: verify2FABodySchema }),
  asyncRoute(verify2FA),
);
router.post(
  "/auth/2fa/disable",
  passport.authenticate("jwt", { session: false }),
  validate({ body: disable2FABodySchema }),
  asyncRoute(disable2FA),
);
router.get(
  "/auth/2fa/status",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(get2FAStatus),
);

// ─── Security Audit Logs ─────────────────────────────────
router.get(
  "/security/audit-log",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getUserSecurityAuditLog),
);
router.get(
  "/orgs/audit-log",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getOrgSecurityAuditLog),
);

// ─── API Keys ────────────────────────────────────────────
router.get(
  "/api-keys",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(listApiKeys),
);
router.post(
  "/api-keys",
  passport.authenticate("jwt", { session: false }),
  validate({ body: createApiKeyBodySchema }),
  asyncRoute(createApiKeyForOrg),
);
router.post(
  "/api-keys/:id/revoke",
  passport.authenticate("jwt", { session: false }),
  validate({ params: objectIdSchema }),
  asyncRoute(revokeApiKey),
);

export default router;
