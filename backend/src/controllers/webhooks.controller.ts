import type { Request, Response } from "express";
import { broadcast } from "../services/realtime.service.js";

export async function elevenlabsWebhook(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ received: true });
}

export async function elevenlabsCodeGeneration(req: Request, res: Response): Promise<void> {
  const body = req.body as { projectId?: string; path?: string; content?: string; action?: string };
  if (body.projectId && (body.path || body.action)) {
    broadcast("file:created", {
      projectId: body.projectId,
      path: body.path,
      content: body.content,
    });
  }
  res.status(200).json({ received: true });
}
