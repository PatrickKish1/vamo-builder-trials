"use server";

import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "sessionToken";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function getApiBase(): string {
  const base = (
    process.env.API_URL ??
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    ""
  ).replace(/\/$/, "");
  if (!base) throw new Error("API_URL or BACKEND_URL must be set");
  return base;
}

export type AuthUser = { id: string; email: string; name: string };

export async function loginAction(
  email: string,
  password: string
): Promise<{ user: AuthUser } | { error: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json()) as {
    user?: AuthUser;
    session?: { token?: string };
    error?: string;
    requiresConfirmation?: boolean;
  };

  if (!res.ok) {
    return { error: data.error ?? "Login failed" };
  }
  if (data.requiresConfirmation) {
    return { error: "Please confirm your email before signing in." };
  }
  if (!data.user || !data.session?.token) {
    return { error: "Invalid response from server" };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, data.session.token, {
    httpOnly: true,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return { user: data.user };
}

export async function signupAction(
  email: string,
  password: string,
  name?: string
): Promise<
  | { user: AuthUser }
  | { requiresConfirmation: true }
  | { error: string }
> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/v1/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  const data = (await res.json()) as {
    user?: AuthUser;
    session?: { token?: string };
    error?: string;
    requiresConfirmation?: boolean;
  };

  if (!res.ok) {
    return { error: data.error ?? "Signup failed" };
  }
  if (data.requiresConfirmation) {
    return { requiresConfirmation: true };
  }
  if (!data.user || !data.session?.token) {
    return { error: "Invalid response from server" };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, data.session.token, {
    httpOnly: true,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return { user: data.user };
}

export async function logoutAction(): Promise<void> {
  const base = getApiBase();
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      await fetch(`${base}/api/v1/auth/logout`, {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });
    }
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch {
    /* ignore */
  }
}

export async function setSessionFromTokenAction(
  accessToken: string
): Promise<{ user: AuthUser } | { error: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/v1/auth/set-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken }),
  });
  const data = (await res.json()) as { user?: AuthUser; error?: string };

  if (!res.ok) {
    return { error: data.error ?? "Invalid token" };
  }
  if (!data.user) {
    return { error: "Invalid response" };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, accessToken, {
    httpOnly: true,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return { user: data.user };
}
