import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { registerRoutes } from "./routes/index.js";
import { registerV1Routes } from "./routes/v1/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { optionalAuth } from "./middleware/auth.js";
import * as webhooksController from "./controllers/webhooks.controller.js";

export function createApp(): express.Application {
  const app = express();

  const allowedOrigins = env.frontendOrigin
    ? [env.frontendOrigin]
    : ["http://localhost:3000"];

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );
  app.use(cookieParser());
  // E2B webhook needs raw body for signature verification; mount before express.json()
  app.use(
    "/api/v1/webhooks/e2b",
    express.raw({ type: "application/json" }),
    (req, res, next) => {
      webhooksController.e2bLifecycleWebhook(req, res).catch(next);
    }
  );
  app.use(express.json({ limit: "10mb" }));

  // Request logging: log method, path, and response status so backend console is visible
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const status = res.statusCode;
      const msg = `[${new Date().toISOString()}] ${req.method} ${req.path} ${status} ${Date.now() - start}ms`;
      if (status >= 500) console.error(msg);
      else if (status >= 400) console.warn(msg);
      else console.log(msg);
    });
    next();
  });

  app.use(optionalAuth);

  const apiRouter = express.Router();
  registerRoutes(apiRouter);
  app.use("/api", apiRouter);
  // Versioned API: /api/v1/...
  const v1Router = express.Router();
  registerV1Routes(v1Router);
  app.use("/api/v1", v1Router);

  app.use(errorHandler);

  return app;
}
