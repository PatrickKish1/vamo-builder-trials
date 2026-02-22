import type { Request, Response } from "express";
import * as projectsService from "../services/projects.service.js";
import { badRequest } from "../utils/errors.js";

function getAccessToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
}

export async function listProjects(req: Request, res: Response): Promise<void> {
  const userId = (req.query.userId as string) || undefined;
  const projectId = (req.query.projectId as string) || undefined;
  const token = getAccessToken(req);

  const result = await projectsService.listProjects(token, userId ?? null, projectId ?? null);
  if (result.project !== undefined) {
    res.json(result);
    return;
  }
  res.json({ projects: result.projects ?? [] });
}

export async function createProject(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    name?: string;
    id?: string;
    userId?: string | null;
    isPlayground?: boolean;
    expiresAt?: number;
  };
  if (!body.name) throw badRequest("Project name is required");

  const result = await projectsService.createProject(getAccessToken(req), {
    name: body.name,
    id: body.id,
    userId: body.userId,
    isPlayground: body.isPlayground,
    expiresAt: body.expiresAt,
  });
  res.json(result);
}

export async function updateProject(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    id: string;
    name?: string;
    activeFilePath?: string | null;
    openFilePaths?: string[];
    dirtyFiles?: string[];
  };
  const result = await projectsService.updateProject(getAccessToken(req), {
    id: body.id,
    name: body.name,
    activeFilePath: body.activeFilePath,
    openFilePaths: body.openFilePaths,
    dirtyFiles: body.dirtyFiles,
  });
  res.json(result);
}

export async function deleteProject(req: Request, res: Response): Promise<void> {
  const id = req.query.id as string;
  await projectsService.deleteProject(getAccessToken(req), id);
  res.json({ success: true });
}
