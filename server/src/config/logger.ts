import pino from "pino";
import pinoHttp from "pino-http";

const isTest = process.env.NODE_ENV === "test";

export const logger = pino({
  level: isTest ? "silent" : process.env.LOG_LEVEL || "info",
  base: undefined,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "req.body.password",
      "req.body.otp",
      "req.body.token",
      "req.body.command",
      "req.body.rows",
      "req.body.file",
      "req.body.image",
      "req.body.buffer",
      "req.body.receipt_buffer",
    ],
    remove: true,
  },
});

export const httpLogger = pinoHttp({
  logger,
  customProps: req => ({
    requestId: (req as any).requestId,
    userId: (req as any).user?._id?.toString?.(),
  }),
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
});
