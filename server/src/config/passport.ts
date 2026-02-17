import passport from "passport";
import { Strategy as JwtStrategy } from "passport-jwt";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import UserModel from "../models/userModel";
import { getEnv } from "./env";

export const configurePassport = () => {
  const env = getEnv();

  passport.use(
    "jwt",
    new JwtStrategy(
      {
        jwtFromRequest: req => {
          const token = (req as any)?.cookies?.jwt;
          return token || null;
        },
        secretOrKey: env.JWT_SECRET,
      },
      async (jwtPayload, done) => {
        try {
          const user = await UserModel.findById(jwtPayload.id);
          if (user) {
            return done(null, user);
          }
          return done(null, false);
        } catch (error) {
          return done(error as any, false);
        }
      }
    )
  );

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      "google",
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackURL: env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            let user = await UserModel.findOne({ googleId: profile.id });

            if (user) {
              return done(null, user);
            }

            user = await UserModel.findOne({ email: profile.emails?.[0]?.value });

            if (user) {
              user.googleId = profile.id;
              user.photoURL = profile.photos?.[0]?.value;
              user.isEmailVerified = true;
              await user.save();
              return done(null, user);
            }

            user = await UserModel.create({
              googleId: profile.id,
              name: profile.displayName,
              email: profile.emails?.[0]?.value,
              photoURL: profile.photos?.[0]?.value,
              authProvider: "google",
              isEmailVerified: true,
            });

            return done(null, user);
          } catch (error) {
            return done(error as any, false);
          }
        }
      )
    );
  } else if (env.NODE_ENV !== "test") {
    console.warn("Google OAuth credentials not found; Google authentication will not work");
  }
};

export default passport;
