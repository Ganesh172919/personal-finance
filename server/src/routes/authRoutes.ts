import { Router } from "express";
import passport from "passport";
import {
  register,
  login,
  verifyEmail,
  getGoogleCallback,
   resendVerification,
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

const router = Router();
const CLIENT_URL = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");

router.post("/register", validate({ body: registerBodySchema }), register);

router.post("/login", validate({ body: loginBodySchema }), login);

router.post("/verify-email", validate({ body: verifyEmailBodySchema }), verifyEmail);

router.post("/resend-verification", validate({ body: resendVerificationBodySchema }), resendVerification);

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${CLIENT_URL}/login`,
    session: false,
  }),
  getGoogleCallback
);

router.get(
  "/profile",
  passport.authenticate("jwt", { session: false }),
  getProfile
);

router.post("/logout", logout);

export default router;
