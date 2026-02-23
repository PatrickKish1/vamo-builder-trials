import type { Request, Response } from "express";
import * as authService from "../services/auth.service.js";
import { badRequest } from "../utils/errors.js";
import { clearSessionCookie, setSessionCookie } from "../utils/authCookie.js";
import { getAccessToken } from "../middleware/auth.js";

export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as { email?: string; password?: string };
  const { email, password } = body;

  if (!email || !password) {
    throw badRequest("Email and password are required");
  }

  const result = await authService.login(email, password);
  if (result.session?.token) {
    setSessionCookie(res, result.session.token);
  }
  res.json({
    user: result.user,
    session: result.session ? { token: result.session.token } : undefined,
    requiresConfirmation: result.requiresConfirmation,
  });
}

export async function signup(req: Request, res: Response): Promise<void> {
  const body = req.body as { email?: string; password?: string; name?: string };
  const { email, password, name } = body;

  if (!email || !password) {
    throw badRequest("Email and password are required");
  }

  const result = await authService.signup(email, password, name);
  if (result.session?.token) {
    setSessionCookie(res, result.session.token);
  }
  res.json({
    user: result.user,
    session: result.session ? { token: result.session.token } : undefined,
    requiresConfirmation: result.requiresConfirmation,
  });
}

/**
 * GET /auth/session – token from cookie (preferred) or Authorization: Bearer.
 * Returns { user, authenticated } so frontend AuthContext stays compatible.
 */
export async function session(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  console.log("[auth] GET /session: token present:", !!token);

  if (!token) {
    res.json({ user: null, authenticated: false });
    return;
  }

  const result = await authService.getSessionUser(token);
  console.log("[auth] GET /session: authenticated:", result.authenticated, "userId:", result.user?.id ?? "—");
  res.json(result);
}

export async function logout(_req: Request, res: Response): Promise<void> {
  clearSessionCookie(res);
  res.json({ success: true });
}

/**
 * POST /auth/set-session – body: { access_token }.
 * Used after OAuth callback: validates token, sets HttpOnly cookie, returns { user }.
 */
export async function setSession(req: Request, res: Response): Promise<void> {
  const body = req.body as { access_token?: string };
  const accessToken = body?.access_token;

  if (!accessToken || typeof accessToken !== "string") {
    res.status(400).json({ error: "access_token required" });
    return;
  }

  const result = await authService.setSessionByToken(accessToken);
  if (!result) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  setSessionCookie(res, result.session!.token);
  res.json({ user: result.user });
}
