import { Router } from "express";
import * as webhooksController from "../controllers/webhooks.controller.js";

export const webhooksRouter: Router = Router();

webhooksRouter.post("/elevenlabs", (req, res, next) => {
  webhooksController.elevenlabsWebhook(req, res).catch(next);
});
webhooksRouter.post("/elevenlabs/code-generation", (req, res, next) => {
  webhooksController.elevenlabsCodeGeneration(req, res).catch(next);
});
