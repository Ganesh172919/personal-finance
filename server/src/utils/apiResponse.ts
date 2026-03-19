import type { Response } from "express";

type ErrorResponseOptions = {
  message: string;
  code?: string;
  details?: unknown;
  requestId?: string;
};

export const createErrorResponseBody = ({
  message,
  code,
  details,
  requestId,
}: ErrorResponseOptions) => {
  return {
    success: false as const,
    message,
    data: null,
    ...(code ? { code } : {}),
    ...(details !== undefined ? { details } : {}),
    ...(requestId ? { request_id: requestId } : {}),
  };
};

export const sendErrorResponse = (
  res: Response,
  statusCode: number,
  options: ErrorResponseOptions,
) => {
  return res.status(statusCode).json(createErrorResponseBody(options));
};
