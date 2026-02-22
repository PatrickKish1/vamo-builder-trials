import type { Request, Response } from "express";

export async function listMcp(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ error: "MCP list not yet implemented on backend." });
}

export async function createMcp(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ error: "MCP create not yet implemented on backend." });
}

export async function updateMcp(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ error: "MCP update not yet implemented on backend." });
}
