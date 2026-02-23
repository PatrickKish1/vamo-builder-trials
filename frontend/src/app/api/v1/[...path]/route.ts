/**
 * Same-origin proxy to the Express backend.
 * Client calls /api/v1/* (same origin); this route forwards to API_URL.
 * Keeps the backend URL server-only (set API_URL or BACKEND_URL in env, not NEXT_PUBLIC_).
 */

const FORWARD_HEADERS = [
  "authorization",
  "content-type",
  "accept",
  "accept-language",
  "cookie",
] as const;

function getBackendBaseUrl(): string {
  const base =
    process.env.API_URL ??
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "";
  return base.replace(/\/$/, "");
}

function buildBackendUrl(pathSegments: string[], request: Request): string {
  const base = getBackendBaseUrl();
  if (!base) {
    throw new Error(
      "API_URL, BACKEND_URL, or NEXT_PUBLIC_API_URL must be set for the API proxy"
    );
  }
  const path = pathSegments.length ? `/${pathSegments.join("/")}` : "";
  const { searchParams } = new URL(request.url);
  const query = searchParams.toString();
  const search = query ? `?${query}` : "";
  return `${base}/api/v1${path}${search}`;
}

function forwardHeaders(request: Request): Headers {
  const out = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name);
    if (value) out.set(name, value);
  }
  return out;
}

async function proxy(request: Request, pathSegments: string[]) {
  const url = buildBackendUrl(pathSegments, request);
  const method = request.method;
  const headers = forwardHeaders(request);
  const body =
    method !== "GET" && method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined;

  const res = await fetch(url, { method, headers, body });

  const responseHeaders = new Headers(res.headers);
  const getSetCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie
      : null;
  if (getSetCookie) {
    for (const cookie of getSetCookie.call(res.headers)) {
      responseHeaders.append("Set-Cookie", cookie);
    }
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const segments = path ?? [];
  return proxy(request, segments);
}

export async function POST(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxy(request, path ?? []);
}

export async function PUT(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxy(request, path ?? []);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxy(request, path ?? []);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxy(request, path ?? []);
}
