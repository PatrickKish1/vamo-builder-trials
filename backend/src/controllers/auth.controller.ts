import type { Request, Response } from "express";
import * as authService from "../services/auth.service.js";
import { badRequest } from "../utils/errors.js";

export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as { email?: string; password?: string };
  const { email, password } = body;

  if (!email || !password) {
    throw badRequest("Email and password are required");
  }

  const result = await authService.login(email, password);
  res.json(result);
}

export async function signup(req: Request, res: Response): Promise<void> {
  const body = req.body as { email?: string; password?: string; name?: string };
  const { email, password, name } = body;

  if (!email || !password) {
    throw badRequest("Email and password are required");
  }

  const result = await authService.signup(email, password, name);
  res.json(result);
}

/**
 * GET /auth/session – requires Authorization: Bearer <token>.
 * Returns { user, authenticated } so frontend AuthContext stays compatible.
 */
export async function session(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  if (!token) {
    res.json({ user: null, authenticated: false });
    return;
  }

  const result = await authService.getSessionUser(token);
  res.json(result);
}

export async function logout(_req: Request, res: Response): Promise<void> {
  const result = authService.logout();
  res.json(result);
}
