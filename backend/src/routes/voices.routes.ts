import { Router } from "express";
import * as voicesController from "../controllers/voices.controller.js";

export const voicesRouter: Router = Router();

voicesRouter.get("/", (req, res, next) => {
  voicesController.listVoices(req, res).catch(next);
});
voicesRouter.post("/select", (req, res, next) => {
  voicesController.selectVoice(req, res).catch(next);
});
