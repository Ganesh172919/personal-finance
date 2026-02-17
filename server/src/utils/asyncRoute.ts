import type { NextFunction, Request, RequestHandler, Response } from "express";

export const asyncRoute = (handler: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

