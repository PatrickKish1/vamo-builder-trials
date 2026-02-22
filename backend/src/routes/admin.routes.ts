import type { Router } from "express";
import { Router as createRouter } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as adminController from "../controllers/admin.controller.js";

export const adminRouter: Router = createRouter();

const wrap =
  (fn: (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>) =>
  (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) =>
    fn(req, res, next).catch(next);

adminRouter.get("/stats", requireAuth, wrap(adminController.getStats));
adminRouter.get("/users", requireAuth, wrap(adminController.getUsers));
adminRouter.get("/redemptions", requireAuth, wrap(adminController.getRedemptions));
adminRouter.post("/redemptions/:id", requireAuth, wrap(adminController.updateRedemption));
adminRouter.get("/analytics", requireAuth, wrap(adminController.getAnalytics));
adminRouter.get("/projects", requireAuth, wrap(adminController.getProjects));
