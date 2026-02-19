import { Router } from "express";
import passport from "passport";
import rateLimit from "express-rate-limit";
import {
  register,
  login,
  verifyEmail,
  getGoogleCallback,
  resendVerification,
  getCsrfToken,
  getProfile,
  logout,
} from "../controllers/authController";
import { validate } from "../middleware/validate";
import {
  loginBodySchema,
  registerBodySchema,
  resendVerificationBodySchema,
  verifyEmailBodySchema
} from "../schemas/authSchemas";
import { getEnv } from "../config/env";
import { createRedisRateLimitStore } from "../config/rateLimitStore";
import { asyncRoute } from "../utils/asyncRoute";

const router = Router();
const env = getEnv();
const CLIENT_URL = env.CLIENT_URL.replace(/\/$/, "");
const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

const authRateLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  store: createRedisRateLimitStore("rl_auth:"),
  message: {
    message: "Too many authentication attempts, please try again shortly.",
    code: "AUTH_RATE_LIMITED",
  },
});

router.get("/providers", (req, res) => {
  res.json({ email: true, google: googleEnabled, request_id: req.requestId });
});

router.get("/csrf", asyncRoute(getCsrfToken));

router.post("/register", authRateLimiter, validate({ body: registerBodySchema }), asyncRoute(register));

router.post("/login", authRateLimiter, validate({ body: loginBodySchema }), asyncRoute(login));

router.post("/verify-email", authRateLimiter, validate({ body: verifyEmailBodySchema }), asyncRoute(verifyEmail));

router.post(
  "/resend-verification",
  authRateLimiter,
  validate({ body: resendVerificationBodySchema }),
  asyncRoute(resendVerification)
);

if (googleEnabled) {
  router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

  router.get(
    "/google/callback",
    passport.authenticate("google", {
      failureRedirect: `${CLIENT_URL}/login`,
      session: false,
    }),
    asyncRoute(getGoogleCallback)
  );
} else {
  router.get("/google", (req, res) => {
    res.status(501).json({
      message: "Google OAuth is not configured on this server.",
      code: "OAUTH_NOT_CONFIGURED",
      request_id: req.requestId,
    });
  });
  router.get("/google/callback", (req, res) => {
    res.status(501).json({
      message: "Google OAuth is not configured on this server.",
      code: "OAUTH_NOT_CONFIGURED",
      request_id: req.requestId,
    });
  });
}

router.get(
  "/profile",
  passport.authenticate("jwt", { session: false }),
  asyncRoute(getProfile)
);

router.post("/logout", asyncRoute(logout));

export default router;
