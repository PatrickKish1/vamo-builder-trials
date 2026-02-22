import { Router, type Request, type Response } from "express";

export const healthRouter: Router = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "backend",
  });
});
