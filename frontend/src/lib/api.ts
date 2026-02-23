/**
 * Base URL for API v1 calls. Use for all API calls (auth, projects, files, chat, etc.).
 *
 * In the browser we always use same-origin paths (/api/v1/...) so requests go through
 * the Next.js proxy and the session cookie (set for this origin) is sent. Set API_URL
 * or BACKEND_URL server-side only so the proxy knows where to forward.
 *
 * On the server (SSR/route handlers), getApiUrl() can use NEXT_PUBLIC_API_URL if set.
 */
export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  return (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
}

/** Full URL for API v1 path (e.g. '/auth/login' -> 'http://localhost:4000/api/v1/auth/login'). */
export function apiV1(path: string): string {
  const base = getApiUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}/api/v1${p}` : `/api/v1${p}`;
}

/** Sentinel for cookie-based session (backend sets HttpOnly cookie). */
export const COOKIE_SESSION = "cookie";

export type AuthFetchOptions = {
  /** When false, do not redirect to /auth on 401 (caller handles it). Default true. */
  redirectOn401?: boolean;
};

import { getAuthUrl } from "./auth-redirect";

/**
 * Fetch for authenticated API calls. Uses cookie (credentials) when token is COOKIE_SESSION.
 * On 401 redirects to /auth?returnTo=<current path> so after login the user returns to this page.
 */
export async function authFetch(
  url: string,
  options?: RequestInit,
  token?: string | null,
  fetchOptions?: AuthFetchOptions
): Promise<Response> {
  const headers = new Headers(options?.headers);
  if (token && token !== COOKIE_SESSION) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    headers.delete("Authorization");
  }
  const res = await fetch(url, { ...options, credentials: "include", headers });
  if (
    res.status === 401 &&
    typeof window !== "undefined" &&
    fetchOptions?.redirectOn401 !== false
  ) {
    window.location.replace(getAuthUrl());
    return res;
  }
  return res;
}
