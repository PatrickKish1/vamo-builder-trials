import { Router } from "express";
import * as cleanupController from "../controllers/cleanup.controller.js";

export const cleanupRouter: Router = Router();

cleanupRouter.post("/playground", (req, res, next) => {
  cleanupController.cleanupPlayground(req, res).catch(next);
});
