import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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
import { requestContext } from "./middleware/requestContext";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { getEnv } from "./config/env";
import { httpLogger } from "./config/logger";
import { metricsHandler, metricsMiddleware } from "./observability/metrics";
import { csrfProtection } from "./middleware/csrfProtection";
import { optionalJwtAuth } from "./middleware/optionalJwtAuth";

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
    keyGenerator: (req, _res) => {
      const userId = (req as any).user?._id?.toString?.();
      return userId || req.ip;
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
    })
  );

  app.use(express.json({ limit: REQUEST_SIZE_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: REQUEST_SIZE_LIMIT }));
  app.use(cookieParser());
  app.use(passport.initialize());
  app.use(requestContext);
  app.use(httpLogger);
  app.use(metricsMiddleware);
  app.use(optionalJwtAuth);
  app.use("/api", apiRateLimiter);
  app.use("/api", csrfProtection);

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

  // Routes
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
    console.log(`Server configured on PORT=${env.PORT}`);
    console.log(`Expecting Python AI service at ${PYTHON_API_URL}`);
  }

  return app;
};
