/**
 * @fileoverview Async Route Wrapper Utility
 *
 * This module provides a wrapper function for Express route handlers that return
 * promises (async functions). It catches any rejected promises and passes them
 * to Express's error handling middleware.
 *
 * THE PROBLEM THIS SOLVES:
 * Express 4/5 does NOT automatically catch rejected promises from async route handlers.
 * If an async handler throws or rejects, the request hangs indefinitely and the error
 * is lost. This wrapper ensures all async errors are properly caught and forwarded
 * to the error handler.
 *
 * EXPRESS 5 NOTE:
 * Express 5 does handle async errors natively, but this wrapper is still useful for:
 * - Backward compatibility with Express 4 patterns
 * - Explicit documentation that the handler is async
 * - Consistent error handling across the codebase
 *
 * @example
 * // Without wrapper (DANGEROUS - errors are lost):
 * router.get('/users', async (req, res) => {
 *   const users = await User.find(); // If this throws, request hangs!
 *   res.json(users);
 * });
 *
 * // With wrapper (SAFE - errors are caught):
 * router.get('/users', asyncRoute(async (req, res) => {
 *   const users = await User.find(); // If this throws, error handler is called
 *   res.json(users);
 * }));
 *
 * @module utils/asyncRoute
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async Express route handler to ensure promise rejections are caught.
 *
 * HOW IT WORKS:
 * 1. Calls the handler and wraps the result in Promise.resolve()
 * 2. If the handler returns a rejected promise, .catch(next) passes the error
 *    to Express's error handling middleware
 * 3. If the handler is synchronous, Promise.resolve() handles the return value
 *
 * @param handler - Async route handler function
 * @returns Express RequestHandler with proper error handling
 */
export const asyncRoute = (handler: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler => {
  return (req, res, next) => {
    // Promise.resolve() handles both sync and async return values
    // .catch(next) forwards any rejection to Express error handler
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

