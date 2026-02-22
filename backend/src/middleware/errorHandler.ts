import type { Request, Response, NextFunction } from "express";
import { isAppError } from "../utils/errors.js";

interface ErrorResponse {
  error: string;
  code?: string;
}

interface SupabasePostgresError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

function isPostgresError(err: unknown): err is SupabasePostgresError {
  if (typeof err !== "object" || err === null) return false;
  const candidate = err as Record<string, unknown>;
  return (
    typeof candidate.code === "string" &&
    /^[0-9A-Z]{5}$/.test(candidate.code) &&
    typeof candidate.message === "string"
  );
}

function isPayloadTooLarge(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === "PayloadTooLargeError" || (err as { type?: string }).type === "entity.too.large";
  }
  return (
    typeof err === "object" &&
    err !== null &&
    ((err as { name?: string }).name === "PayloadTooLargeError" ||
      (err as { type?: string }).type === "entity.too.large")
  );
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Always log full details server-side regardless of error type
  console.error("[API error]", err instanceof Error ? err.stack : err, err);

  if (isAppError(err)) {
    const body: ErrorResponse = {
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (isPayloadTooLarge(err)) {
    res.status(413).json({
      error: "Request body too large. Try sending less context (e.g. fewer or smaller files).",
      code: "PAYLOAD_TOO_LARGE",
    } satisfies ErrorResponse);
    return;
  }

  // Postgres / Supabase errors: never expose raw DB messages to the client
  if (isPostgresError(err)) {
    res.status(500).json({
      error: "A database error occurred. Please try again.",
      code: "DB_ERROR",
    } satisfies ErrorResponse);
    return;
  }

  res.status(500).json({
    error: "Something went wrong. Please try again.",
    code: "INTERNAL_ERROR",
  } satisfies ErrorResponse);
}
