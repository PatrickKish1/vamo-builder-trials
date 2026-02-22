import { NextRequest, NextResponse } from "next/server";

const ADMIN_PATH = "/admin";

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const sessionCookie =
    req.cookies.get("sb-access-token")?.value ??
    req.cookies.get("supabase-auth-token")?.value ??
    req.headers.get("x-session-token") ??
    null;

  const isAuthenticated = Boolean(sessionCookie);

  if (pathname.startsWith(ADMIN_PATH)) {
    if (!isAuthenticated) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/auth";
      loginUrl.search = "";
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  const builderProjectPath = /^\/builder\/build\/[^/]+/;
  if (!isAuthenticated && builderProjectPath.test(pathname)) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/auth";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
