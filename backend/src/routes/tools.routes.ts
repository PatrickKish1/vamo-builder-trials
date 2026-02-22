import { Router } from "express";
import * as toolsController from "../controllers/tools.controller.js";

export const toolsRouter: Router = Router();

toolsRouter.get("/list", (req, res, next) => {
  toolsController.listTools(req, res).catch(next);
});
toolsRouter.post("/create", (req, res, next) => {
  toolsController.createTool(req, res).catch(next);
});
