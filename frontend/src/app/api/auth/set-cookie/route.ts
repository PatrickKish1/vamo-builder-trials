/**
 * POST /api/auth/set-cookie – sets the session cookie from a token (same options as backend).
 * Used after login/signup so the cookie is set from our origin even if the proxy doesn't forward Set-Cookie.
 */

import { NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "sessionToken";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export async function POST(request: Request) {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = body?.token;
  if (!token || typeof token !== "string" || !token.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const isProduction = process.env.NODE_ENV === "production";
  const cookieValue = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token.trim())}; Path=/; HttpOnly; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${isProduction ? "; Secure" : ""}`;

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": cookieValue,
      },
    }
  );
}
