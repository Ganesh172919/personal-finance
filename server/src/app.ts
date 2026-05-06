/**
 * @fileoverview Main Application Entry Point
 *
 * This file is the core of the Express.js server application for the Personal Finance platform.
 * It configures and exports a factory function `createApp()` that creates a fully configured
 * Express application instance with all middleware, routes, security features, and error handling.
 *
 * KEY RESPONSIBILITIES:
 * - Express application initialization and configuration
 * - CORS (Cross-Origin Resource Sharing) configuration
 * - Security headers and helmet middleware setup
 * - Rate limiting for API endpoints and authentication
 * - Request body parsing and sanitization (NoSQL injection prevention)
 * - Authentication middleware (Passport.js, JWT, API keys)
 * - Request/response context and logging
 * - Route mounting (v1 API and legacy routes)
 * - Health check endpoints
 * - Error handling middleware
 *
 * ARCHITECTURE NOTES:
 * - Uses factory pattern (createApp) for testability
 * - Middleware stack is ordered for optimal security and performance
 * - Supports both canonical (/api/v1) and legacy (/api) route structures
 * - Integrates with Python AI service for AI-related features
 *
 * @module app
 */

import express from "express"; // Express web framework for building REST APIs
import cors from "cors"; // Cross-Origin Resource Sharing middleware
import cookieParser from "cookie-parser"; // Parse cookies from request headers
import helmet from "helmet"; // Security middleware that sets various HTTP headers
import rateLimit from "express-rate-limit"; // Rate limiting middleware to prevent abuse
import type { Request, Response, NextFunction } from "express"; // TypeScript types for Express
import passport from "./config/passport"; // Passport.js authentication configuration
import axios from "axios"; // HTTP client for making requests to Python AI service
import { requestContext } from "./middleware/requestContext"; // Middleware to attach request ID and context
import { errorHandler, notFoundHandler } from "./middleware/errorHandler"; // Error handling middleware
import { getEnv } from "./config/env"; // Environment configuration loader
import { httpLogger, logger } from "./config/logger"; // HTTP and application logging
import { metricsHandler, metricsMiddleware } from "./observability/metrics"; // Prometheus metrics
import { csrfProtection } from "./middleware/csrfProtection"; // CSRF token validation
import { optionalJwtAuth } from "./middleware/optionalJwtAuth"; // Optional JWT authentication
import { orgContext } from "./middleware/orgContext"; // Organization context middleware
import { legacyApiDeprecation } from "./middleware/legacyApiDeprecation"; // Legacy API deprecation warnings
import { responseContext } from "./middleware/responseContext"; // Response context middleware
import { securityHeaders } from "./middleware/securityHeaders"; // Additional security headers
import { mountCanonicalApiRoutes, mountLegacyApiRoutes } from "./routes/routeRegistry"; // Route mounting utilities
import { sendErrorResponse } from "./utils/apiResponse"; // Standardized error response utility

/**
 * Creates and configures a new Express application instance.
 *
 * This factory function sets up the complete Express application with:
 * 1. Security middleware (CORS, Helmet, CSRF, rate limiting)
 * 2. Request parsing (JSON, URL-encoded, cookies)
 * 3. Authentication (Passport.js, JWT, API keys)
 * 4. Request/response context and logging
 * 5. Route mounting (v1 API and legacy routes)
 * 6. Error handling
 *
 * @returns {express.Application} Configured Express application instance
 *
 * @example
 * // Create and start the server
 * const app = createApp();
 * app.listen(3000, () => console.log('Server running on port 3000'));
 */
export const createApp = () => {
  // Initialize Express application
  const app = express();

  // Load environment configuration
  const env = getEnv();
  const PYTHON_API_URL = env.PYTHON_API_URL; // URL for Python AI service
  const REQUEST_SIZE_LIMIT = env.REQUEST_SIZE_LIMIT; // Maximum request body size
  const CORS_ORIGINS = env.CORS_ORIGINS; // Allowed CORS origins
  const allowAllCorsOrigins = CORS_ORIGINS.includes("*"); // Flag to allow all origins

  // Trust proxy headers (for load balancers, reverse proxies)
  app.set("trust proxy", env.TRUST_PROXY);
  // Disable X-Powered-By header for security
  app.disable("x-powered-by");

  /**
   * Rate Limiter Configuration
   *
   * Limits the number of requests per time window to prevent abuse.
   * Uses different key strategies:
   * - API key org ID (for API key authenticated requests)
   * - Organization ID (for org-contextual requests)
   * - User ID (for authenticated user requests)
   * - IP address (fallback for unauthenticated requests)
   */
  const apiRateLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS, // Time window in milliseconds
    max: env.RATE_LIMIT_MAX, // Maximum requests per window
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    passOnStoreError: true, // Continue if rate limit store fails
    keyGenerator: (req, _res) => {
      // Use API key org ID if available
      const apiKeyOrgId = (req as any).apiKey?.orgId;
      if (apiKeyOrgId) {
        return `api_key_org:${String(apiKeyOrgId)}`;
      }

      // Use organization ID if available
      const orgId = (req as any).org?.orgId;
      if (orgId) {
        return `org:${String(orgId)}`;
      }

      // Use user ID if available
      const userIdRaw = (req as any).user?._id;
      if (userIdRaw) {
        return `user:${String(userIdRaw)}`;
      }

      // Fallback to IP address
      return String(req.ip || "unknown");
    },
    handler: (req, res) => {
      // Custom rate limit exceeded response
      sendErrorResponse(res, 429, {
        message: "Too many requests, please try again shortly.",
        code: "RATE_LIMITED",
        requestId: req.requestId,
      });
    },
  });

  /**
   * CORS Configuration
   *
   * Allows cross-origin requests from specified origins.
   * Supports credentials (cookies, authorization headers).
   */
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin || allowAllCorsOrigins || CORS_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }
        // Reject requests from unauthorized origins
        callback(new Error("Origin not allowed by CORS"));
      },
      credentials: true, // Allow cookies to be sent
    }),
  );

  /**
   * Helmet Security Configuration
   *
   * Sets various HTTP headers to secure the application:
   * - Content Security Policy (CSP)
   * - X-Content-Type-Options
   * - X-Frame-Options
   * - X-XSS-Protection
   * - And more...
   */
  app.use(
    helmet({
      crossOriginResourcePolicy: false, // Disable CORP for cross-origin requests
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"], // Only allow resources from same origin
          scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts (needed for some UI frameworks)
          styleSrc: [
            "'self'",
            "'unsafe-inline'", // Allow inline styles
            "https://fonts.googleapis.com", // Allow Google Fonts
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"], // Allow Google Fonts
          imgSrc: ["'self'", "data:", "blob:", "https:", "http:"], // Allow images from various sources
          connectSrc: ["'self'", ...CORS_ORIGINS.filter((o) => o !== "*")], // Allow API calls to specified origins
        },
      },
    }),
  );

  // Extra security headers (Permissions-Policy, cache-control, HSTS)
  app.use(
    securityHeaders({
      hsts: env.NODE_ENV === "production", // Enable HSTS only in production
      contentSecurityPolicy: "", // helmet already sets CSP above
    }),
  );

  /**
   * Request Body Parsing Configuration
   *
   * - JSON parser with size limit
   * - URL-encoded parser for form data
   * - Special handling for billing webhooks (raw body preservation)
   */
  app.use(
    express.json({
      limit: REQUEST_SIZE_LIMIT, // Maximum JSON body size
      verify: (req, _res, buf) => {
        // Preserve raw body for billing webhook signature verification
        const path = String((req as any).originalUrl || (req as any).url || "");
        if (path.startsWith("/api/v1/billing/webhook")) {
          (req as any).rawBody = buf;
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: REQUEST_SIZE_LIMIT })); // Parse URL-encoded bodies

  /**
   * NoSQL Injection Prevention
   *
   * Custom sanitizer that strips MongoDB operators ($gt, $ne, etc.) and
   * dot-notation keys from request body and params.
   * This is Express 5 compatible (unlike express-mongo-sanitize v2).
   */
  const stripDollarDot = (obj: any): any => {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(stripDollarDot);
    const clean: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      // Skip keys starting with $ (MongoDB operators) or containing dots
      if (key.startsWith("$") || key.includes(".")) continue;
      clean[key] = stripDollarDot(obj[key]);
    }
    return clean;
  };

  // Apply NoSQL injection sanitization to request body and params
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === "object")
      req.body = stripDollarDot(req.body);
    if (req.params && typeof req.params === "object") {
      const cleaned = stripDollarDot(req.params);
      for (const k of Object.keys(cleaned)) (req.params as any)[k] = cleaned[k];
    }
    next();
  });

  /**
   * Cookie Parser Configuration
   *
   * Parses cookies from request headers with secret for signed cookies.
   */
  app.use(cookieParser(env.COOKIE_SECRET));

  /**
   * Passport.js Initialization
   *
   * Initializes Passport authentication strategies (JWT, Google OAuth, etc.)
   */
  app.use(passport.initialize());

  /**
   * Request Context Middleware
   *
   * Attaches a unique request ID to each request for tracing and logging.
   */
  app.use(requestContext);

  /**
   * Response Context Middleware
   *
   * Adds response context and headers to responses.
   */
  app.use(responseContext);

  /**
   * Legacy API Deprecation Middleware
   *
   * Adds deprecation warnings to responses from legacy API endpoints.
   */
  app.use(legacyApiDeprecation);

  /**
   * HTTP Logger Middleware
   *
   * Logs HTTP requests and responses for monitoring and debugging.
   */
  app.use(httpLogger);

  /**
   * Metrics Middleware
   *
   * Collects and exposes Prometheus metrics for monitoring.
   */
  app.use(metricsMiddleware);

  /**
   * Optional JWT Authentication Middleware
   *
   * Attempts to authenticate requests using JWT tokens.
   * Does not reject unauthenticated requests (optional).
   */
  app.use(optionalJwtAuth);

  /**
   * Organization Context Middleware
   *
   * Extracts and attaches organization context from request headers or user context.
   */
  app.use(orgContext);

  /**
   * Apply Rate Limiting to API Routes
   *
   * Rate limiter is applied to all /api routes.
   */
  app.use("/api", apiRateLimiter);

  /**
   * CSRF Protection for API Routes
   *
   * Validates CSRF tokens for state-changing operations (POST, PUT, DELETE).
   */
  app.use("/api", csrfProtection);

  /**
   * Authentication Rate Limiter
   *
   * Tighter rate limit specifically for authentication endpoints to prevent brute-force attacks.
   */
  const authRateLimiter = rateLimit({
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS, // Time window for auth rate limiting
    max: env.AUTH_RATE_LIMIT_MAX, // Maximum auth attempts per window
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Disable legacy headers
    keyGenerator: (req) => String(req.ip || "unknown"), // Use IP address as key
    handler: (req, res) => {
      // Custom auth rate limit exceeded response
      sendErrorResponse(res, 429, {
        message: "Too many authentication attempts, please try again later.",
        code: "AUTH_RATE_LIMITED",
        requestId: req.requestId,
      });
    },
  });

  // Apply auth rate limiter to authentication endpoints
  app.use("/api/v1/auth", authRateLimiter);
  app.use("/api/auth", authRateLimiter);

  /**
   * Health Check Endpoints
   *
   * These endpoints must be mounted before authenticated routes to ensure
   * they are accessible without authentication.
   */
  // Basic health check endpoint
  app.get("/api/test", (_req, res) => {
    res.json({ message: "Hello from the Personal Finance Server!" });
  });

  // Kubernetes-style health check endpoint
  app.get("/healthz", (_req, res) => {
    res.status(200).send("ok");
  });

  /**
   * Python AI Service Health Check
   *
   * Checks the health of the Python AI service by making a request to its /health endpoint.
   * Returns 503 if the service is unavailable.
   */
  app.get("/api/python-health", async (req, res) => {
    try {
      const response = await axios.get(`${PYTHON_API_URL}/health`, {
        headers: {
          "X-Request-Id": req.requestId, // Pass request ID for tracing
        },
        timeout: 4000, // 4 second timeout
      });

      res.json({ python_service: response.data, request_id: req.requestId });
    } catch (_error) {
      // Return 503 if Python service is unavailable
      res
        .status(503)
        .json({ python_service: "unavailable", request_id: req.requestId });
    }
  });

  /**
   * Route Mounting
   *
   * Mount canonical v1 API routes before legacy routes because Express
   * matches routes in order, and /api prefix also matches /api/v1/*.
   */
  // Mount canonical /api/v1 routes
  mountCanonicalApiRoutes(app, env);

  // Mount legacy /api routes (kept during deprecation window)
  mountLegacyApiRoutes(app, env);

  /**
   * Prometheus Metrics Endpoint
   *
   * Exposes Prometheus metrics for monitoring.
   * Guarded by METRICS_TOKEN for security.
   */
  app.get("/api/metrics", metricsHandler);

  /**
   * Error Handling Middleware
   *
   * - notFoundHandler: Catches 404 errors for undefined routes
   * - errorHandler: Global error handler for all other errors
   */
  app.use(notFoundHandler);
  app.use(errorHandler);

  // Log server configuration (except in test environment)
  if (env.NODE_ENV !== "test") {
    logger.info(`Server configured on PORT=${env.PORT}`);
    logger.info(`Expecting Python AI service at ${PYTHON_API_URL}`);
  }

  // Return configured Express application
  return app;
};
