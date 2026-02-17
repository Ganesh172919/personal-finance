import { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, ZodTypeAny } from "zod";
import { HttpError } from "./httpError";

type ValidationSchemas = {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
};

const parseSchema = <T>(
  schema: ZodTypeAny | undefined,
  value: unknown,
  part: "body" | "params" | "query"
): T | undefined => {
  if (!schema) {
    return undefined;
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "VALIDATION_ERROR", `Invalid ${part}`, result.error.flatten());
  }

  return result.data as T;
};

export const validate = (schemas: ValidationSchemas): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsedBody = parseSchema(schemas.body, req.body, "body");
      const parsedParams = parseSchema(schemas.params, req.params, "params");
      const parsedQuery = parseSchema(schemas.query, req.query, "query");

      if (parsedBody) {
        req.body = parsedBody;
      }

      if (parsedParams) {
        Object.assign(req.params as Record<string, unknown>, parsedParams as Record<string, unknown>);
      }

      if (parsedQuery) {
        const currentQuery = req.query as Record<string, unknown>;
        for (const key of Object.keys(currentQuery)) {
          delete currentQuery[key];
        }
        Object.assign(currentQuery, parsedQuery as Record<string, unknown>);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new HttpError(400, "VALIDATION_ERROR", "Invalid request payload", error.flatten()));
        return;
      }
      next(error);
    }
  };
};
