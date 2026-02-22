import { Router } from "express";
import * as mcpController from "../controllers/mcp.controller.js";

export const mcpRouter: Router = Router();

mcpRouter.get("/list", (req, res, next) => {
  mcpController.listMcp(req, res).catch(next);
});
mcpRouter.post("/create", (req, res, next) => {
  mcpController.createMcp(req, res).catch(next);
});
mcpRouter.put("/update", (req, res, next) => {
  mcpController.updateMcp(req, res).catch(next);
});
