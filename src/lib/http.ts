import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logger } from './logger';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static notFound(message: string) {
    return new ApiError('NOT_FOUND', message, 404);
  }
  static conflict(message: string, details?: unknown) {
    return new ApiError('CONFLICT', message, 409, details);
  }
  static unauthorized(message = 'Invalid or missing webhook credentials') {
    return new ApiError('UNAUTHORIZED', message, 401);
  }
  static validation(message: string, details?: unknown) {
    return new ApiError('VALIDATION_ERROR', message, 422, details);
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(code: ApiErrorCode, message: string, status: number, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

/** Single error funnel so every route returns the same envelope shape. */
export function handleRouteError(error: unknown, route: string) {
  if (error instanceof ApiError) {
    return fail(error.code, error.message, error.status, error.details);
  }
  if (error instanceof ZodError) {
    return fail('VALIDATION_ERROR', 'Request body failed validation', 422, error.issues);
  }
  logger.error('Unhandled route error', { route, error: String(error) });
  return fail('INTERNAL_ERROR', 'Unexpected server error', 500);
}
