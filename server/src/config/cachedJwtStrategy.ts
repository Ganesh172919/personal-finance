/**
 * @fileoverview JWT strategy for the request path.
 *
 * Differences from the stock passport-jwt Strategy:
 *  1. Fast path: when the global optionalJwtAuth middleware already verified the
 *     same cookie token on this request (it stores `req.auth`), per-route
 *     `passport.authenticate("jwt")` reuses that identity instead of verifying the
 *     token and loading the user a second time.
 *  2. The user and MFA enrollment status are fetched fresh on every JWT
 *     verification so another replica's enrollment immediately revokes old JWTs.
 */
import { Strategy as JwtStrategy, type StrategyOptionsWithoutRequest } from "passport-jwt";

import { getAuthUser } from "../services/authCache";

export interface RequestAuth {
  /** The raw JWT cookie value that was verified. */
  token: string;
  /** The authenticated user document. */
  user: unknown;
}

export class CachedJwtStrategy extends JwtStrategy {
  constructor(options: StrategyOptionsWithoutRequest) {
    super(options, async (jwtPayload: { id?: string; mfa?: boolean; sv?: string }, done: (err: unknown, user?: unknown) => void) => {
      try {
        const user = jwtPayload?.id ? await getAuthUser(String(jwtPayload.id), { fresh: true }) : null;
        // A session minted before enrollment must not remain fully authenticated
        // after the second factor is enabled, even on another API replica.
        return done(null, user && user.sessionVersion === jwtPayload.sv
          && (!user.twoFactorEnabled || jwtPayload.mfa === true) ? user : false);
      } catch (error) {
        return done(error, false);
      }
    });
  }

  authenticate(req: any, options?: any) {
    const auth = req?.auth as RequestAuth | undefined;
    if (auth?.user && auth.token && auth.token === req?.cookies?.jwt) {
      (this as any).success(auth.user);
      return;
    }
    return JwtStrategy.prototype.authenticate.call(this, req, options);
  }
}
