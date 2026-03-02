import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import passport from "./config/passport";
import axios from "axios";

import authRoutes from "./routes/authRoutes";
import aiRoutes from "./routes/aiRoutes";
import chatRoutes from "./routes/chatRoutes";
import financialDataRoutes from "./routes/financialDataRoutes";
import taskRoutes from "./routes/taskRoutes";
import receiptRoutes from "./routes/receiptRoutes";
import financialJournalRoutes from "./routes/financialJournalRoutes";
import mediaRoutes from "./routes/mediaRoutes";
import monetizationRoutes from "./routes/monetizationRoutes";
import configRoutes from "./routes/configRoutes";
import v1Routes from "./routes/v1Routes";
import internalToolsRoutes from "./routes/internalToolsRoutes";
import publicShareRoutes from "./routes/publicShareRoutes";
import blogRoutes from "./routes/blogRoutes";
import growthStoryRoutes from "./routes/growthStoryRoutes";
import { requestContext } from "./middleware/requestContext";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { getEnv } from "./config/env";
import { httpLogger, logger } from "./config/logger";
import { metricsHandler, metricsMiddleware } from "./observability/metrics";
import { csrfProtection } from "./middleware/csrfProtection";
import { optionalJwtAuth } from "./middleware/optionalJwtAuth";
import { orgContext } from "./middleware/orgContext";
import { legacyApiDeprecation } from "./middleware/legacyApiDeprecation";
import { responseContext } from "./middleware/responseContext";

export const createApp = () => {
  const app = express();

  const env = getEnv();
  const PYTHON_API_URL = env.PYTHON_API_URL;
  const REQUEST_SIZE_LIMIT = env.REQUEST_SIZE_LIMIT;
  const CORS_ORIGINS = env.CORS_ORIGINS;
  const allowAllCorsOrigins = CORS_ORIGINS.includes("*");

  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");

  const apiRateLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    keyGenerator: (req, _res) => {
      const apiKeyOrgId = (req as any).apiKey?.orgId;
      if (apiKeyOrgId) {
        return `api_key_org:${String(apiKeyOrgId)}`;
      }

      const orgId = (req as any).org?.orgId;
      if (orgId) {
        return `org:${String(orgId)}`;
      }

      const userIdRaw = (req as any).user?._id;
      if (userIdRaw) {
        return `user:${String(userIdRaw)}`;
      }

      return String(req.ip || "unknown");
    },
    message: {
      message: "Too many requests, please try again shortly.",
      code: "RATE_LIMITED",
    },
  });

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowAllCorsOrigins || CORS_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin not allowed by CORS"));
      },
      credentials: true,
    })
  );

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", ...CORS_ORIGINS.filter(o => o !== "*")],
        },
      },
    })
  );

  // Extra security headers (Permissions-Policy, cache‑control, HSTS)
  const { securityHeaders } = require("./middleware/securityHeaders");
  app.use(securityHeaders({
    hsts: env.NODE_ENV === "production",
    contentSecurityPolicy: "", // helmet already sets CSP above
  }));

  app.use(
    express.json({
      limit: REQUEST_SIZE_LIMIT,
      verify: (req, _res, buf) => {
        const path = String((req as any).originalUrl || (req as any).url || "");
        if (path.startsWith("/api/v1/billing/webhook")) {
          (req as any).rawBody = buf;
        }
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: REQUEST_SIZE_LIMIT }));
  // Custom NoSQL-injection sanitizer (Express 5 compatible).
  // express-mongo-sanitize v2 crashes on Express 5 because req.query is read-only.
  const stripDollarDot = (obj: any): any => {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(stripDollarDot);
    const clean: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      if (key.startsWith("$") || key.includes(".")) continue;
      clean[key] = stripDollarDot(obj[key]);
    }
    return clean;
  };
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === "object") req.body = stripDollarDot(req.body);
    if (req.params && typeof req.params === "object") {
      const cleaned = stripDollarDot(req.params);
      for (const k of Object.keys(cleaned)) (req.params as any)[k] = cleaned[k];
    }
    next();
  });
  app.use(cookieParser());
  app.use(passport.initialize());
  app.use(requestContext);
  app.use(responseContext);
  app.use(legacyApiDeprecation);
  app.use(httpLogger);
  app.use(metricsMiddleware);
  app.use(optionalJwtAuth);
  app.use(orgContext);
  app.use("/api", apiRateLimiter);
  app.use("/api", csrfProtection);

  // Tighter rate limit on auth endpoints (brute-force protection)
  const authRateLimiter = rateLimit({
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.ip || "unknown"),
    message: {
      message: "Too many authentication attempts, please try again later.",
      code: "AUTH_RATE_LIMITED",
    },
  });
  app.use("/api/v1/auth", authRateLimiter);
  app.use("/api/auth", authRateLimiter);

  // Health checks (must stay before authenticated /api routers)
  app.get("/api/test", (_req, res) => {
    res.json({ message: "Hello from the FinWise Server!" });
  });
  app.get("/healthz", (_req, res) => {
    res.status(200).send("ok");
  });

  app.get("/api/python-health", async (req, res) => {
    try {
      const response = await axios.get(`${PYTHON_API_URL}/health`, {
        headers: {
          "X-Request-Id": req.requestId,
        },
        timeout: 4000,
      });

      res.json({ python_service: response.data, request_id: req.requestId });
    } catch (_error) {
      res.status(503).json({ python_service: "unavailable", request_id: req.requestId });
    }
  });

  // Canonical /api/v1 surface:
  // mount v1 before /api because `/api` prefix also matches `/api/v1/*` in Express.
  app.use("/api/internal/tools", internalToolsRoutes);
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/config", configRoutes);
  app.use("/api/v1/public", publicShareRoutes);
  app.use("/api/v1/blogs", blogRoutes);
  app.use("/api/v1/growth-stories", growthStoryRoutes);
  app.use("/api/v1", v1Routes);
  if (env.MONETIZATION_ENABLED) {
    app.use("/api/v1", monetizationRoutes);
  }
  // vNext shims: mount legacy feature routers under /api/v1 (keep /api routes intact for one release cycle).
  app.use("/api/v1", aiRoutes);
  app.use("/api/v1/chat", chatRoutes);
  app.use("/api/v1", financialDataRoutes);
  app.use("/api/v1", receiptRoutes);
  app.use("/api/v1", financialJournalRoutes);
  app.use("/api/v1", mediaRoutes);
  if (env.TASKS_ENABLED) {
    app.use("/api/v1/tasks", taskRoutes);
  }

  // Legacy /api routes (kept during deprecation window)
  app.use("/api/auth", authRoutes);
  app.use("/api/config", configRoutes);
  if (env.MONETIZATION_ENABLED) {
    app.use("/api", monetizationRoutes);
  }
  app.use("/api", aiRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api", financialDataRoutes);
  app.use("/api", receiptRoutes);
  app.use("/api", financialJournalRoutes);
  app.use("/api", mediaRoutes);
  if (env.TASKS_ENABLED) {
    app.use("/api/tasks", taskRoutes);
  }

  // Prometheus metrics (guarded by METRICS_TOKEN)
  app.get("/api/metrics", metricsHandler);

  app.use(notFoundHandler);
  app.use(errorHandler);

  if (env.NODE_ENV !== "test") {
    logger.info(`Server configured on PORT=${env.PORT}`);
    logger.info(`Expecting Python AI service at ${PYTHON_API_URL}`);
  }

  return app;
};
