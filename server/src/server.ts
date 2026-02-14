import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import passport from "./config/passport";
import axios from "axios";

dotenv.config();

import { connectDB } from "./config/database";
import authRoutes from "./routes/authRoutes";
import aiRoutes from "./routes/aiRoutes";
import chatRoutes from "./routes/chatRoutes";
import financialDataRoutes from "./routes/financialDataRoutes";
import { configurePassport } from "./config/passport";
import { requestContext } from "./middleware/requestContext";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

configurePassport();
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;
const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8001";
const REQUEST_SIZE_LIMIT = process.env.REQUEST_SIZE_LIMIT || "1mb";
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

const apiRateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.RATE_LIMIT_MAX || 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many requests, please try again shortly.",
    code: "RATE_LIMITED",
  },
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || CORS_ORIGINS.includes(origin)) {
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
app.use("/api", apiRateLimiter);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", aiRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api", financialDataRoutes);

// Health check
app.get("/api/test", (_req, res) => {
  res.json({ message: "Hello from the FinWise Server!" });
});

// Python service health check
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

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Expecting Python AI service at ${PYTHON_API_URL}`);
});