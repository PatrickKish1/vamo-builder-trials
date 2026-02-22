import type { Request, Response } from "express";

export async function importRepo(_req: Request, res: Response): Promise<void> {
  res.status(501).json({
    error: "GitHub import not yet implemented on backend; use frontend proxy or implement here.",
  });
}

export async function listBranches(_req: Request, res: Response): Promise<void> {
  res.status(501).json({
    error: "GitHub branches not yet implemented on backend.",
  });
}
