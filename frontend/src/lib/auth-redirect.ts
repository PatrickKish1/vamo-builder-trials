/**
 * Shared auth redirect logic so "login then return to this page" works
 * consistently for all protected pages (wallet, builder, projects, etc.).
 * Prefer returnTo in the URL as the single source of truth.
 */

export const DEFAULT_AFTER_LOGIN = "/builder";

/**
 * Valid return path: must be same-origin app path (starts with /, not //).
 */
export function isValidReturnPath(path: string | null): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

/**
 * Current full path (pathname + search) for use when redirecting to login.
 * Use in browser only (e.g. on 401 or "sign in" link).
 */
export function getCurrentPath(): string {
  if (typeof window === "undefined") return DEFAULT_AFTER_LOGIN;
  return window.location.pathname + window.location.search;
}

/**
 * Build /auth URL with returnTo so after login the user is sent back.
 * Always use this when redirecting to the auth page from protected pages or on 401.
 */
export function getAuthUrl(returnPath?: string): string {
  const path = returnPath ?? getCurrentPath();
  if (!isValidReturnPath(path)) return "/auth";
  return `/auth?returnTo=${encodeURIComponent(path)}`;
}

/**
 * Resolve where to send the user after login: URL returnTo first, then sessionStorage fallback, then default.
 */
export function getReturnPathAfterLogin(
  returnToFromUrl: string | null,
  sessionStorageFallback?: string | null
): string {
  if (isValidReturnPath(returnToFromUrl)) return returnToFromUrl;
  if (typeof sessionStorageFallback === "string" && isValidReturnPath(sessionStorageFallback)) {
    return sessionStorageFallback;
  }
  return DEFAULT_AFTER_LOGIN;
}
