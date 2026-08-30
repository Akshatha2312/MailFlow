import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Logger } from '@mailflow/shared';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function errorHandler(err: ApiError, _req: Request, res: Response, _next: NextFunction): Response {
  const statusCode = err.statusCode || 500;
  const code = err.code || (statusCode === 400 ? 'BAD_REQUEST' : statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR');

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.errors,
    });
  }

  Logger.error(`API Error [${code}]: ${err.message}`, {
    statusCode,
    code,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  return res.status(statusCode).json({
    error: err.message || 'An unexpected error occurred',
    code,
    ...(err.details ? { details: err.details } : {}),
    ...(process.env.NODE_ENV === 'development' && err.stack ? { stack: err.stack } : {}),
  });
}
