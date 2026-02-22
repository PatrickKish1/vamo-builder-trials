import type { Router } from "express";
import { healthRouter } from "./health.routes.js";
import { authRouter } from "./auth.routes.js";

/**
 * Aggregates all route modules.
 * Mount at /api so that paths match current frontend: /api/health, /api/auth/...
 */
export function registerRoutes(router: Router): void {
  router.use("/health", healthRouter);
  router.use("/auth", authRouter);
}
