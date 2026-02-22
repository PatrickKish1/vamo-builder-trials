/**
 * Base URL for API v1 calls. Use for all API calls (auth, projects, files, chat, etc.).
 *
 * Proxy mode (backend URL hidden from client):
 * - Leave NEXT_PUBLIC_API_URL unset. Then apiV1() returns same-origin paths (/api/v1/...).
 * - Requests go to the Next.js server, which proxies to the real backend (set API_URL or
 *   BACKEND_URL server-side only in .env).
 *
 * Direct mode: set NEXT_PUBLIC_API_URL (e.g. http://localhost:4000) so the client calls
 * the backend directly.
 */
export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    return (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  }
  return (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
}

/** Full URL for API v1 path (e.g. '/auth/login' -> 'http://localhost:4000/api/v1/auth/login'). */
export function apiV1(path: string): string {
  const base = getApiUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}/api/v1${p}` : `/api/v1${p}`;
}

/**
 * Fetch that on 401 clears session and redirects to /auth so expired tokens don't leave the app stuck.
 * Use for authenticated API calls. Caller should still check response.ok.
 */
export async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status === 401 && typeof window !== "undefined") {
    window.localStorage.removeItem("sessionToken");
    window.location.replace("/auth");
    return res;
  }
  return res;
}
