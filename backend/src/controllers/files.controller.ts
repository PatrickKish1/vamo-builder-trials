import type { Request, Response } from "express";
import * as filesService from "../services/files.service.js";
import { badRequest } from "../utils/errors.js";

function getAccessToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
}

export async function listFiles(req: Request, res: Response): Promise<void> {
  const projectId = req.query.projectId as string;
  const path = (req.query.path as string) || undefined;
  console.log("[files] GET / projectId:", projectId ?? "none", "path:", path ?? "root");
  const result = await filesService.listFiles(
    getAccessToken(req),
    projectId,
    path ?? null
  );
  res.json(result);
}

export async function applyFileAction(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    action: filesService.FileAction;
    path: string;
    projectId?: string;
    userId?: string | null;
    content?: string;
    isFolder?: boolean;
    newPath?: string;
    encoding?: "text" | "base64";
    mimeType?: string;
  };
  if (!body.path) throw badRequest("Path is required");
  if (!body.projectId) throw badRequest("Project ID is required");

  const result = await filesService.applyFileAction(getAccessToken(req), {
    action: body.action,
    path: body.path,
    projectId: body.projectId,
    userId: body.userId,
    content: body.content,
    isFolder: body.isFolder,
    newPath: body.newPath,
    encoding: body.encoding,
    mimeType: body.mimeType,
  });
  res.json(result);
}

export async function uploadFiles(_req: Request, res: Response): Promise<void> {
  res.status(501).json({
    error: "Multipart upload not yet implemented; use POST /files with action create and content in body.",
  });
}
