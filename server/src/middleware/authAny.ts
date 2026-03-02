import type { RequestHandler } from "express";
import mongoose from "mongoose";

import passport from "../config/passport";
import { resolveApiKey } from "../services/apiKeys";
import ApiKeyModel from "../models/apiKeyModel";
import {
  enforceFeatureLimit,
  recordFeatureUsage,
} from "../services/entitlements";
import { HttpError } from "./httpError";

export const authAny: RequestHandler = (req, res, next) => {
  passport.authenticate(
    "jwt",
    { session: false },
    async (err: unknown, user: unknown) => {
      try {
        if (err) {
          next(err);
          return;
        }

        if (user) {
          (req as any).user = user;
          next();
          return;
        }

        const header = String(req.header("authorization") || "");
        const token = header.startsWith("Bearer ")
          ? header.slice("Bearer ".length).trim()
          : "";
        const rawKey = token || String(req.header("x-api-key") || "").trim();

        if (!rawKey) {
          res
            .status(401)
            .json({
              message: "Unauthorized",
              code: "UNAUTHORIZED",
              request_id: req.requestId,
            });
          return;
        }

        const key = await resolveApiKey(rawKey);
        if (!key) {
          res
            .status(401)
            .json({
              message: "Invalid API key",
              code: "API_KEY_INVALID",
              request_id: req.requestId,
            });
          return;
        }

        (req as any).apiKey = {
          id: String((key as any)._id),
          orgId: String((key as any).orgId),
          createdByUserId: String((key as any).createdByUserId || ""),
          scopes: Array.isArray((key as any).scopes)
            ? (key as any).scopes.map((s: unknown) => String(s))
            : [],
          keyPrefix: String((key as any).keyPrefix || ""),
        };

        if (!(req as any).org) {
          (req as any).org = {
            orgId: String((key as any).orgId),
            memberId: "",
            role: "owner",
          };
        }

        void ApiKeyModel.updateOne(
          { _id: (key as any)._id },
          { $set: { lastUsedAt: new Date() } },
        ).catch(() => null);

        const createdByUserId = String((key as any).createdByUserId || "");
        const orgId = String((key as any).orgId || "");
        if (
          mongoose.Types.ObjectId.isValid(createdByUserId) &&
          mongoose.Types.ObjectId.isValid(orgId)
        ) {
          const orgObjectId = new mongoose.Types.ObjectId(orgId);
          const userObjectId = new mongoose.Types.ObjectId(createdByUserId);

          // Enforce quota BEFORE recording usage — block if limit exhausted
          try {
            await enforceFeatureLimit({
              orgId: orgObjectId,
              userId: userObjectId,
              feature: "api_requests",
              units: 1,
              requestId: req.requestId,
            });
          } catch (enforceError) {
            if (
              enforceError instanceof HttpError &&
              enforceError.statusCode === 402
            ) {
              res.status(402).json({
                message: enforceError.message,
                code: enforceError.code,
                details: enforceError.details,
                request_id: req.requestId,
              });
              return;
            }
            throw enforceError;
          }

          await recordFeatureUsage({
            orgId: orgObjectId,
            userId: userObjectId,
            feature: "api_requests",
            units: 1,
            requestId: req.requestId,
            context: {
              path: req.path,
              method: req.method,
            },
          }).catch(() => null);
        }

        next();
      } catch (error) {
        next(error);
      }
    },
  )(req, res, next);
};

export const requireScopeIfApiKey = (scope: string): RequestHandler => {
  return (req, res, next) => {
    const apiKey = (req as any).apiKey as { scopes?: string[] } | undefined;
    if (!apiKey) {
      next();
      return;
    }

    const scopes = apiKey.scopes || [];
    if (!scopes.includes(scope)) {
      res.status(403).json({
        message: "Missing required API key scope",
        code: "API_KEY_SCOPE_REQUIRED",
        details: { scope },
        request_id: req.requestId,
      });
      return;
    }

    next();
  };
};
