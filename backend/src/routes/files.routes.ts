import { Router } from "express";
import * as filesController from "../controllers/files.controller.js";

export const filesRouter: Router = Router();

filesRouter.get("/", (req, res, next) => {
  filesController.listFiles(req, res).catch(next);
});
filesRouter.post("/", (req, res, next) => {
  filesController.applyFileAction(req, res).catch(next);
});
filesRouter.post("/upload", (req, res, next) => {
  filesController.uploadFiles(req, res).catch(next);
});
