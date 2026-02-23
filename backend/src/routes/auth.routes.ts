import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";

export const authRouter: Router = Router();

authRouter.post("/login", (req, res, next) => {
  authController.login(req, res).catch(next);
});
authRouter.post("/signup", (req, res, next) => {
  authController.signup(req, res).catch(next);
});
authRouter.get("/session", (req, res, next) => {
  authController.session(req, res).catch(next);
});
authRouter.post("/logout", (req, res, next) => {
  authController.logout(req, res).catch(next);
});
authRouter.post("/set-session", (req, res, next) => {
  authController.setSession(req, res).catch(next);
});
