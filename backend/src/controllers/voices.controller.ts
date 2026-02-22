import type { Request, Response } from "express";

export async function listVoices(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ voices: [] });
}

export async function selectVoice(_req: Request, res: Response): Promise<void> {
  res.status(501).json({
    error: "Voices select not yet implemented on backend.",
  });
}
