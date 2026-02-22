import { Router } from "express";
import * as projectsController from "../controllers/projects.controller.js";

export const projectsRouter: Router = Router();

projectsRouter.get("/", (req, res, next) => {
  projectsController.listProjects(req, res).catch(next);
});
projectsRouter.post("/", (req, res, next) => {
  projectsController.createProject(req, res).catch(next);
});
projectsRouter.put("/", (req, res, next) => {
  projectsController.updateProject(req, res).catch(next);
});
projectsRouter.delete("/", (req, res, next) => {
  projectsController.deleteProject(req, res).catch(next);
});
