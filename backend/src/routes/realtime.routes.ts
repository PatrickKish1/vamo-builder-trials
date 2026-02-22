import { Router } from "express";
import * as realtimeController from "../controllers/realtime.controller.js";

export const realtimeRouter: Router = Router();

realtimeRouter.get("/", (req, res, next) => {
  try {
    realtimeController.getRealtimeStream(req, res);
  } catch (err) {
    next(err);
  }
});
