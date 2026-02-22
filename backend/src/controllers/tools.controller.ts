import type { Request, Response } from "express";

export async function listTools(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ error: "Tools list (ElevenLabs) not yet implemented on backend." });
}

export async function createTool(_req: Request, res: Response): Promise<void> {
  res.status(501).json({ error: "Tools create not yet implemented on backend." });
}
