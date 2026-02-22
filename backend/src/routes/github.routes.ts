import { Router } from "express";
import * as githubController from "../controllers/github.controller.js";

export const githubRouter: Router = Router();

githubRouter.post("/import", (req, res, next) => {
  githubController.importRepo(req, res).catch(next);
});
githubRouter.get("/branches", (req, res, next) => {
  githubController.listBranches(req, res).catch(next);
});
