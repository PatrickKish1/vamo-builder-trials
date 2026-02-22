import type { Router } from "express";
import { Router as createRouter } from "express";
import * as sandboxController from "../controllers/sandbox.controller.js";
import { optionalAuth } from "../middleware/auth.js";

const sandboxRouter: Router = createRouter({ mergeParams: true });

sandboxRouter.use(optionalAuth);

sandboxRouter.post("/create", sandboxController.createSandbox);
sandboxRouter.post("/sync", sandboxController.syncSandbox);
sandboxRouter.post("/run", sandboxController.runCommand);
sandboxRouter.get("/preview", sandboxController.getPreviewUrl);
sandboxRouter.post("/kill", sandboxController.killSandbox);
sandboxRouter.get("/suggest-commands", sandboxController.suggestCommands);

export { sandboxRouter };
