import type { RequestHandler } from "express";
import passport from "../config/passport";

/**
 * Attempts to authenticate via JWT cookie, but does not reject unauthenticated requests.
 * Used to improve rate limiting keys for authenticated users.
 */
export const optionalJwtAuth: RequestHandler = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err: unknown, user: unknown) => {
    if (err) {
      next(err);
      return;
    }
    if (user) {
      (req as any).user = user;
    }
    next();
  })(req, res, next);
};
