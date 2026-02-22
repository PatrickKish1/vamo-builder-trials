import type { Request, Response } from "express";
import * as chatService from "../services/chat.service.js";
import { badRequest, notFound } from "../utils/errors.js";

export async function createThread(_req: Request, res: Response): Promise<void> {
  const threadId = chatService.createThread();
  console.log("[thread] POST / threadId:", threadId);
  res.json({ threadId });
}

export async function getThread(req: Request, res: Response): Promise<void> {
  const threadId = req.query.threadId as string;
  if (!threadId) throw badRequest("Thread ID is required");

  const thread = chatService.getThread(threadId);
  if (!thread) throw notFound("Thread not found");
  res.json(thread);
}
