"use server";

import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "sessionToken";

function getApiBase(): string {
  return (
    process.env.API_URL ??
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    ""
  ).replace(/\/$/, "");
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const base = getApiBase();
  if (!base) return null;

  try {
    const res = await fetch(`${base}/api/v1/auth/session`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
      cache: "no-store",
    });
    const data = (await res.json()) as { authenticated?: boolean; user?: SessionUser };
    if (data.authenticated && data.user) return data.user;
  } catch {
    /* ignore */
  }
  return null;
}
