import { Router } from "express";
import * as rewardsController from "../controllers/rewards.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const rewardsRouter: Router = Router();

rewardsRouter.post("/", requireAuth, (req, res, next) => {
  rewardsController.postReward(req, res).catch(next);
});

rewardsRouter.get("/ledger", requireAuth, (req, res, next) => {
  rewardsController.getLedger(req, res).catch(next);
});

rewardsRouter.get("/redemptions", requireAuth, (req, res, next) => {
  rewardsController.getRedemptions(req, res).catch(next);
});

rewardsRouter.post("/redeem", requireAuth, (req, res, next) => {
  rewardsController.postRedeem(req, res).catch(next);
});
