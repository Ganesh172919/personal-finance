import type { RequestHandler } from "express";
import mongoose from "mongoose";

import ApiKeyModel from "../models/apiKeyModel";
import { resolveApiKey } from "../services/apiKeys";

export const apiKeyAuth: RequestHandler = async (req, res, next) => {
  try {
    const header = String(req.header("authorization") || "");
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    const rawKey = token || String(req.header("x-api-key") || "").trim();

    if (!rawKey) {
      return res.status(401).json({ message: "Missing API key", code: "API_KEY_REQUIRED", request_id: req.requestId });
    }

    const key = await resolveApiKey(rawKey);
    if (!key) {
      return res.status(401).json({ message: "Invalid API key", code: "API_KEY_INVALID", request_id: req.requestId });
    }

    (req as any).apiKey = {
      id: String((key as any)._id),
      orgId: String((key as any).orgId),
      createdByUserId: String((key as any).createdByUserId || ""),
      scopes: Array.isArray((key as any).scopes) ? (key as any).scopes.map((s: unknown) => String(s)) : [],
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
      { _id: new mongoose.Types.ObjectId((key as any)._id) },
      { $set: { lastUsedAt: new Date() } }
    ).catch(() => null);

    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireApiKeyScope = (scope: string): RequestHandler => {
  return (req, res, next) => {
    const apiKey = (req as any).apiKey as { scopes?: string[] } | undefined;
    const scopes = apiKey?.scopes || [];
    if (!scopes.includes(scope)) {
      return res.status(403).json({
        message: "Missing required API key scope",
        code: "API_KEY_SCOPE_REQUIRED",
        details: { scope },
        request_id: req.requestId,
      });
    }
    next();
  };
};
