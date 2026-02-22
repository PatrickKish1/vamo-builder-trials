import type { Router } from "express";
import { healthRouter } from "../health.routes.js";
import { authRouter } from "../auth.routes.js";
import { projectsRouter } from "../projects.routes.js";
import { filesRouter } from "../files.routes.js";
import { chatRouter } from "../chat.routes.js";
import { threadRouter } from "../thread.routes.js";
import { realtimeRouter } from "../realtime.routes.js";
import { builderRouter } from "../builder.routes.js";
import { githubRouter } from "../github.routes.js";
import { voicesRouter } from "../voices.routes.js";
import { toolsRouter } from "../tools.routes.js";
import { mcpRouter } from "../mcp.routes.js";
import { webhooksRouter } from "../webhooks.routes.js";
import { cleanupRouter } from "../cleanup.routes.js";
import { sandboxRouter } from "../sandbox.routes.js";
import { profileRouter } from "../profile.routes.js";
import { rewardsRouter } from "../rewards.routes.js";
import { logsRouter } from "../logs.routes.js";
import { adminRouter } from "../admin.routes.js";

/**
 * API v1 – all routes under /api/v1 for versioning and future scaling.
 */
export function registerV1Routes(router: Router): void {
  router.use("/health", healthRouter);
  router.use("/auth", authRouter);
  router.use("/projects", projectsRouter);
  router.use("/files", filesRouter);
  router.use("/chat", chatRouter);
  router.use("/thread", threadRouter);
  router.use("/realtime", realtimeRouter);
  router.use("/builder", builderRouter);
  router.use("/sandbox", sandboxRouter);
  router.use("/github", githubRouter);
  router.use("/voices", voicesRouter);
  router.use("/tools", toolsRouter);
  router.use("/mcp", mcpRouter);
  router.use("/webhooks", webhooksRouter);
  router.use("/cleanup", cleanupRouter);
  router.use("/profile", profileRouter);
  router.use("/rewards", rewardsRouter);
  router.use("/logs", logsRouter);
  router.use("/admin", adminRouter);
}
