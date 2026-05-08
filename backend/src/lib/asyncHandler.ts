import type { NextFunction, Request, RequestHandler, Response } from "express";

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

// Forwards thrown async errors to Express's error handler instead of crashing.
export function asyncHandler(fn: Handler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
