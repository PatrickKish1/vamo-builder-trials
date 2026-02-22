/**
 * Application error classes and helpers.
 * Use for consistent 4xx/5xx responses; do not expose stack in production.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string
  ) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function badRequest(message: string, code?: string): AppError {
  return new AppError(message, 400, code ?? "BAD_REQUEST");
}

export function unauthorized(message: string = "Unauthorized"): AppError {
  return new AppError(message, 401, "UNAUTHORIZED");
}

export function forbidden(message: string = "Forbidden"): AppError {
  return new AppError(message, 403, "FORBIDDEN");
}

export function notFound(message: string = "Not found"): AppError {
  return new AppError(message, 404, "NOT_FOUND");
}

export function dbError(message = "A database error occurred. Please try again."): AppError {
  return new AppError(message, 500, "DB_ERROR");
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Returns true if the error is from Supabase/PostgREST and indicates invalid or expired JWT.
 * Use to return 401 instead of 500 so the client can clear session and redirect to login.
 */
export function isSupabaseAuthError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  const code = String(error.code ?? "").toLowerCase();
  if (code === "401" || code === "pgrst301" || code === "jwt_expired" || code === "invalid_jwt") return true;
  const authTerms = ["jwt", "expired", "invalid", "token", "unauthorized", "authentication", "signature"];
  return authTerms.some((term) => msg.includes(term));
}
