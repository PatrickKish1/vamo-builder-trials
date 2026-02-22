import { Router } from "express";
import * as profileController from "../controllers/profile.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const profileRouter: Router = Router();

profileRouter.get("/", requireAuth, (req, res, next) => {
  profileController.getProfile(req, res).catch(next);
});
