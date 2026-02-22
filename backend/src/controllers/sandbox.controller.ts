import type { Request, Response } from "express";
import * as sandboxService from "../services/sandbox.service.js";
import * as filesService from "../services/files.service.js";
import { badRequest } from "../utils/errors.js";

function getAccessToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
}

export async function createSandbox(req: Request, res: Response): Promise<void> {
  const projectId = (req.body?.projectId ?? req.query?.projectId) as string;
  const templateId = (req.body?.templateId ?? req.query?.templateId) as string | undefined;
  if (!projectId) throw badRequest("Project ID is required");
  const result = await sandboxService.createSandbox(projectId, templateId);
  res.status(201).json(result);
}

export async function syncSandbox(req: Request, res: Response): Promise<void> {
  const projectId = (req.body?.projectId ?? req.query?.projectId) as string;
  if (!projectId) throw badRequest("Project ID is required");

  let files: sandboxService.FileToSync[];
  if (Array.isArray(req.body?.files) && req.body.files.length > 0) {
    files = req.body.files as sandboxService.FileToSync[];
  } else {
    const { files: list } = await filesService.listFiles(
      getAccessToken(req),
      projectId,
      undefined
    );
    files = list.map((f) => ({
      path: f.path,
      content: f.content ?? "",
      isFolder: f.isFolder,
    }));
  }

  const result = await sandboxService.syncFilesToSandbox(projectId, files);
  res.json(result);
}

export async function runCommand(req: Request, res: Response): Promise<void> {
  const projectId = (req.body?.projectId ?? req.query?.projectId) as string;
  const command = (req.body?.command ?? req.query?.command) as string;
  if (!projectId) throw badRequest("Project ID is required");
  if (typeof command !== "string" || !command.trim()) throw badRequest("Command is required");
  const result = await sandboxService.runCommand(projectId, command.trim());
  res.json(result);
}

export async function getPreviewUrl(req: Request, res: Response): Promise<void> {
  const projectId = req.query.projectId as string;
  const portRaw = req.query.port as string | undefined;
  const port = portRaw ? parseInt(portRaw, 10) : 3000;
  if (!projectId) throw badRequest("Project ID is required");
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw badRequest("Invalid port");
  }
  const result = await sandboxService.getPreviewUrl(projectId, port);
  res.json(result);
}

export async function killSandbox(req: Request, res: Response): Promise<void> {
  const projectId = (req.body?.projectId ?? req.query?.projectId) as string;
  if (!projectId) throw badRequest("Project ID is required");
  const result = await sandboxService.killSandbox(projectId);
  res.json(result);
}

export async function suggestCommands(req: Request, res: Response): Promise<void> {
  const projectId = req.query.projectId as string;
  if (!projectId) throw badRequest("Project ID is required");
  const { files } = await filesService.listFiles(
    getAccessToken(req),
    projectId,
    undefined
  );
  const result = sandboxService.suggestCommands(
    files.map((f) => ({ path: f.path, content: f.content }))
  );
  res.json(result);
}
