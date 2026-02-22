import { Router } from "express";
import * as chatController from "../controllers/chat.controller.js";

export const chatRouter: Router = Router();

chatRouter.post("/", (req, res, next) => {
  chatController.postChat(req, res).catch(next);
});
chatRouter.get("/", (req, res, next) => {
  chatController.getChatHistory(req, res).catch(next);
});
