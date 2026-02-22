import { Router } from "express";
import * as threadController from "../controllers/thread.controller.js";

export const threadRouter: Router = Router();

threadRouter.post("/", (req, res, next) => {
  threadController.createThread(req, res).catch(next);
});
threadRouter.get("/", (req, res, next) => {
  threadController.getThread(req, res).catch(next);
});
