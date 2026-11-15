import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { createRateLimitStore } from "../config/rateLimitStore";
import { sendErrorResponse } from "../utils/apiResponse";

const diagnosticSchema = z.strictObject({
  source: z.enum(["render", "window-error", "unhandled-rejection"]),
  category: z.enum(["auth-context", "theme-context", "asset-load", "unexpected"]),
  route: z.enum(["chat-local", "chat-cloud", "chat", "voice", "files", "dashboard", "auth", "submission", "other"]),
  frames: z.array(z.string().max(160).regex(
    /^(?:src\/[\w/-]+\.[cm]?[jt]sx?|assets\/[\w-]+\.js):\d{1,7}:\d{1,7}$/,
  )).max(8),
});

export function createClientErrorRouter() {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore("rl:client-errors:"),
    handler: (req, res) => {
      sendErrorResponse(res, 429, {
        message: "Too many error reports.",
        code: "CLIENT_ERROR_RATE_LIMITED",
        requestId: req.requestId,
      });
    },
  });

  router.post("/", limiter, (req, res) => {
    const report = diagnosticSchema.safeParse(req.is("application/json") ? req.body : undefined);
    if (!report.success) {
      sendErrorResponse(res, 400, {
        message: "Invalid error report.",
        code: "CLIENT_ERROR_INVALID",
        requestId: req.requestId,
      });
      return;
    }

    req.log.warn({ event: "client.error.reported", ...report.data }, "Browser error received");
    res.status(202).json({ request_id: req.requestId });
  });

  return router;
}
