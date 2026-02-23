import type { Request, Response } from "express";
import * as builderService from "../services/builder.service.js";
import * as chatService from "../services/chat.service.js";
import { getSupabaseClientWithAuth } from "../config/supabase.js";
import { getAccessToken } from "../middleware/auth.js";
import { unauthorized } from "../utils/errors.js";

function getProjectIdParam(req: Request): string {
  const p = req.params.projectId;
  return Array.isArray(p) ? (p[0] ?? "") : (p ?? "");
}

export async function listBuilderProjects(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = (req.query.projectId as string) || undefined;
  const userId = req.user?.id ?? null;
  console.log("[builder] listBuilderProjects", projectId ? `projectId=${projectId}` : "list all");
  const result = await builderService.listBuilderProjects(token, projectId ?? null, userId);
  if (result.project !== undefined) {
    res.json(result);
    return;
  }
  res.json({ projects: result.projects ?? [] });
}

export async function suggestProject(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const body = req.body as { prompt?: string; framework?: string };
  if (!body.prompt?.trim()) {
    res.status(400).json({ error: "Prompt is required" });
    return;
  }
  const result = await chatService.suggestProjectFromPrompt(body.prompt.trim(), body.framework);
  res.json({ name: result.name, logoPrompt: result.logoPrompt });
}

export async function uploadLogo(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const body = req.body as { imageBase64?: string; contentType?: string };
  if (!body.imageBase64 || !body.contentType?.trim()) {
    res.status(400).json({ error: "imageBase64 and contentType are required" });
    return;
  }
  const result = await builderService.uploadLogoImage(token, {
    base64: body.imageBase64,
    contentType: body.contentType.trim(),
  });
  res.json(result);
}

export async function createBuilderProject(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  if (!req.user?.id) throw unauthorized("User not found");
  const body = req.body as {
    name?: string;
    description?: string;
    framework?: string;
    logoUrl?: string | null;
    logoPrompt?: string;
  };
  const result = await builderService.createBuilderProject(token, req.user.id, {
    name: body.name ?? "",
    description: body.description,
    framework: body.framework,
    logoUrl: body.logoUrl,
    logoPrompt: body.logoPrompt,
  });
  res.json(result);
}

export async function updateBuilderProject(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const body = req.body as {
    projectId: string;
    name?: string;
    description?: string;
    founderName?: string | null;
    whyBuilt?: string | null;
    logoUrl?: string | null;
    linkedAssets?: Array<{ type: string; url: string; label?: string }>;
    tractionSignals?: Array<{ type: string; description: string; createdAt: string }>;
    recentActivity?: Array<{ type: string; description: string; createdAt: string }>;
    progressScore?: number;
    agentSummary?: string | null;
  };
  const projectId = body?.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const result = await builderService.updateBuilderProject(token, projectId, {
    name: body.name,
    description: body.description,
    founderName: body.founderName,
    whyBuilt: body.whyBuilt,
    logoUrl: body.logoUrl,
    linkedAssets: body.linkedAssets,
    tractionSignals: body.tractionSignals,
    recentActivity: body.recentActivity,
    progressScore: body.progressScore,
    agentSummary: body.agentSummary,
  });
  res.json(result);
}

export async function deleteBuilderProject(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = (req.body?.projectId ?? req.query.projectId) as string;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  await builderService.deleteBuilderProject(token, projectId);
  res.json({ success: true });
}

export async function authCheck(req: Request, res: Response): Promise<void> {
  if (req.user?.id) {
    res.json({ authenticated: true, userId: req.user.id });
    return;
  }
  const body = req.body as { sessionToken?: string };
  const token = body?.sessionToken ?? getAccessToken(req);
  if (!token) {
    res.status(401).json({ authenticated: false, error: "No session token provided" });
    return;
  }
  const { getSessionUser } = await import("../services/auth.service.js");
  const session = await getSessionUser(token);
  if (!session.authenticated || !session.user) {
    res.status(401).json({ authenticated: false, error: "Invalid session token" });
    return;
  }
  res.json({ authenticated: true, userId: session.user.id });
}

export async function scaffold(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const body = req.body as { projectId: string; description?: string };
  if (!body.projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  console.log("[builder] POST /scaffold projectId:", body.projectId, "description length:", body.description?.length ?? 0);
  const result = await builderService.scaffoldProject(
    token,
    body.projectId,
    body.description
  );
  res.json(result);
}

export async function previewStart(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const body = req.body as { projectId: string };
  if (!body.projectId) {
    console.warn("[builder] preview/start missing projectId");
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  console.log("[builder] preview/start projectId:", body.projectId);
  const result = await builderService.startPreview(token, body.projectId);
  res.json({ ...result, success: true, message: "Preview server started" });
}

export async function getPreviewErrors(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: "projectId is required" });
    return;
  }
  const errors = await builderService.getPreviewErrors(token, projectId);
  if (!errors) {
    res.json({ output: "", hasErrors: false });
    return;
  }
  res.json(errors);
}

export async function runProjectCommand(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = req.params.projectId as string;
  const body = req.body as { command?: string };
  if (!projectId || !body?.command?.trim()) {
    res.status(400).json({ error: "projectId and command are required" });
    return;
  }
  const result = await builderService.runProjectCommand(token, projectId, body.command.trim());
  res.json(result);
}

export async function listFiles(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: "projectId is required" });
    return;
  }
  console.log("[builder] GET /files projectId:", projectId);
  const result = await builderService.listBuilderFiles(token, projectId);
  res.json(result);
}

export async function pauseSandbox(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = getProjectIdParam(req);
  if (!projectId) {
    res.status(400).json({ error: "projectId is required" });
    return;
  }
  const result = await builderService.pauseProjectSandbox(token, projectId);
  res.json(result);
}

export async function syncFromSandbox(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = getProjectIdParam(req);
  if (!projectId) {
    res.status(400).json({ error: "projectId is required" });
    return;
  }
  const result = await builderService.syncProjectFromSandbox(token, projectId);
  res.json(result);
}

export async function proxyPreview(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = getProjectIdParam(req);
  if (!projectId) {
    res.status(400).send("projectId required");
    return;
  }
  const pathToForward = (req.url ?? "/").replace(/\?.*$/, "") || "/";
  try {
    const result = await builderService.proxyPreviewRequest(token, projectId, pathToForward);
    if (result.contentType) res.setHeader("Content-Type", result.contentType);
    let body = result.body;
    if (result.status === 200 && result.contentType?.includes("text/html") && Buffer.isBuffer(body)) {
      const pathPrefix = `/api/v1/builder/projects/${projectId}/preview-proxy`;
      body = Buffer.from(
        body.toString("utf-8").replace(/(href|src)=(["'])\/(?!\/)/g, `$1=$2${pathPrefix}/`),
        "utf-8"
      );
    }
    res.status(result.status).send(body);
  } catch (err) {
    const status = err && typeof (err as { statusCode?: number }).statusCode === "number" ? (err as { statusCode: number }).statusCode : 503;
    if (status === 404) throw err;
    res.status(503).setHeader("Content-Type", "text/html; charset=utf-8").send(builderService.PREVIEW_PROXY_GENERIC_HTML);
  }
}

export async function exportZip(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = req.params.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: "projectId is required" });
    return;
  }
  const { stream, projectName } = await builderService.exportProjectZipStream(token, projectId);
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 80) || "project";
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.zip"`);
  stream.pipe(res);
}

export async function applyFile(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const body = req.body as {
    projectId: string;
    action: "create" | "update" | "delete";
    path: string;
    content?: string;
  };
  if (!body.projectId || !body.action || !body.path) {
    res.status(400).json({ error: "projectId, action, and path are required" });
    return;
  }
  const result = await builderService.applyBuilderFileAction(token, {
    projectId: body.projectId,
    action: body.action,
    path: body.path,
    content: body.content,
  });
  res.json(result);
}

/** Generate code for a single file and optionally apply it. Used by file-plan flow and by tools (e.g. ElevenLabs). */
export async function generateFile(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const body = req.body as {
    projectId: string;
    path: string;
    action: "create" | "update";
    description: string;
    currentContent?: string;
    model?: chatService.ChatModelId;
    apply?: boolean;
  };
  if (!body.projectId || !body.path || !body.action || !body.description) {
    res.status(400).json({
      error: "projectId, path, action, and description are required",
    });
    return;
  }
  if (body.action !== "create" && body.action !== "update") {
    res.status(400).json({ error: "action must be create or update" });
    return;
  }
  let currentContent = body.currentContent;
  if (body.action === "update" && currentContent == null) {
    const fetched = await builderService.getBuilderFileContent(
      token,
      body.projectId,
      body.path
    );
    currentContent = fetched ?? undefined;
  }
  const content = await chatService.generateFileContent({
    path: body.path,
    action: body.action,
    description: body.description,
    currentContent,
    model: body.model,
  });
  const apply = body.apply !== false;
  if (apply && content.trim()) {
    await builderService.applyBuilderFileAction(token, {
      projectId: body.projectId,
      action: body.action,
      path: body.path,
      content,
    });
  }
  res.json({ content, applied: apply && content.trim().length > 0 });
}

export async function addCollaborator(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  if (!req.user?.id) throw unauthorized("User not found");
  const projectId = req.params.projectId as string;
  const body = req.body as { email?: string; permission?: "view" | "edit" };
  if (!projectId || !body?.email?.trim()) {
    res.status(400).json({ error: "projectId and email are required" });
    return;
  }
  const result = await builderService.addCollaborator(token, projectId, req.user.id, {
    email: body.email.trim(),
    permission: body.permission === "edit" ? "edit" : "view",
  });
  res.json(result);
}

export async function listCollaborators(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = req.params.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: "projectId is required" });
    return;
  }
  const result = await builderService.listCollaborators(token, projectId);
  res.json(result);
}

export async function getInvite(req: Request, res: Response): Promise<void> {
  const token = (req.query.token as string) ?? "";
  if (!token.trim()) {
    res.status(400).json({ error: "token is required" });
    return;
  }
  try {
    const info = await builderService.getInviteByToken(token);
    if (!info) {
      res.status(404).json({ error: "Invite not found or expired" });
      return;
    }
    res.json(info);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invite service unavailable";
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      res.status(503).json({ error: "Invite flow is not configured" });
      return;
    }
    throw err;
  }
}

export async function acceptInvite(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  if (!req.user?.id) throw unauthorized("User not found");
  const body = req.body as { token?: string };
  const inviteToken = (body?.token ?? req.query.token) as string;
  if (!inviteToken?.trim()) {
    res.status(400).json({ error: "Invite token is required" });
    return;
  }
  const result = await builderService.acceptInvite(token, inviteToken, req.user.id);
  res.json(result);
}

export async function cloneProject(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  if (!req.user?.id) throw unauthorized("User not found");
  const sourceProjectId = (req.body?.sourceProjectId ?? req.params.projectId) as string;
  if (!sourceProjectId?.trim()) {
    res.status(400).json({ error: "sourceProjectId is required" });
    return;
  }
  const result = await builderService.cloneBuilderProject(token, req.user.id, sourceProjectId);
  res.json(result);
}

export async function listMarketplace(_req: Request, res: Response): Promise<void> {
  const result = await builderService.listMarketplaceProjects();
  res.json(result);
}

export async function getMarketplaceProject(req: Request, res: Response): Promise<void> {
  const projectId = (req.params.projectId ?? req.params.id) as string;
  if (!projectId?.trim()) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const project = await builderService.getMarketplaceProjectById(projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found or not listed" });
    return;
  }
  res.json(project);
}

export async function createMarketplaceBid(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  if (!req.user?.id || !req.user?.email) throw unauthorized("User not found");
  const projectId = (req.params.projectId ?? req.params.id) as string;
  if (!projectId?.trim()) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body as { amountLow?: number; amountHigh?: number; message?: string; transferType?: "full" | "partial" };
  const amountLow = typeof body.amountLow === "number" ? body.amountLow : 0;
  const amountHigh = typeof body.amountHigh === "number" ? body.amountHigh : 0;
  const transferType = body.transferType === "partial" ? "partial" : "full";
  const result = await builderService.createMarketplaceBid(
    token,
    projectId,
    { amountLow, amountHigh, message: body.message, transferType },
    req.user.id,
    req.user.email
  );
  res.status(201).json(result);
}

export async function listMarketplaceBids(req: Request, res: Response): Promise<void> {
  const projectId = (req.params.projectId ?? req.params.id) as string;
  if (!projectId?.trim()) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const token = getAccessToken(req);
  const userId = req.user?.id;
  const result = await builderService.listMarketplaceBids(projectId, token, userId ?? undefined);
  res.json(result);
}

export async function acceptMarketplaceBid(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const bidId = req.params.bidId as string;
  if (!bidId?.trim()) {
    res.status(400).json({ error: "Bid ID is required" });
    return;
  }
  const result = await builderService.acceptMarketplaceBid(token, bidId);
  if (!result.ok) {
    res.status(400).json({ error: result.error ?? "Could not accept offer" });
    return;
  }
  res.json({ success: true, transferType: result.transferType });
}

export async function listProjectForSale(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = (req.body?.projectId ?? req.params.projectId) as string;
  if (!projectId?.trim()) {
    res.status(400).json({ error: "projectId is required" });
    return;
  }
  const result = await builderService.listProjectForSale(token, projectId);
  res.json(result);
}

export async function generateProjectLogo(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const body = req.body as { prompt?: string; projectName?: string };
  if (!body.projectName?.trim()) {
    res.status(400).json({ error: "projectName is required" });
    return;
  }
  const result = await builderService.generateProjectLogo(body.projectName.trim(), body.prompt);
  res.json(result);
}

/** POST /builder/logo-preview – returns logo as base64 when possible (so it loads in the modal), else URL. */
export async function logoPreview(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const body = req.body as { projectName?: string; logoPrompt?: string };
  if (!body.projectName?.trim()) {
    res.status(400).json({ error: "projectName is required" });
    return;
  }
  const result = await builderService.getLogoPreviewImage(
    body.projectName.trim(),
    body.logoPrompt?.trim()
  );
  res.json(result);
}

export async function uploadProjectLogo(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = getProjectIdParam(req);
  if (!projectId) {
    res.status(400).json({ error: "projectId is required" });
    return;
  }
  const body = req.body as { logoPrompt?: string; projectName?: string };
  if (!body.projectName?.trim()) {
    res.status(400).json({ error: "projectName is required" });
    return;
  }
  const result = await builderService.uploadProjectLogoToStorage(token, projectId, {
    logoPrompt: body.logoPrompt,
    projectName: body.projectName.trim(),
  });
  res.json(result);
}

export async function connectGitHub(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = getProjectIdParam(req);
  const body = req.body as { token?: string; repoName?: string };
  if (!body.token?.trim() || !body.repoName?.trim()) {
    res.status(400).json({ error: "token and repoName are required" });
    return;
  }
  const result = await builderService.connectGitHub(token, projectId, body.token.trim(), body.repoName.trim());
  res.json(result);
}

export async function syncGitHub(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = getProjectIdParam(req);
  const body = req.body as { token?: string };
  if (!body.token?.trim()) {
    res.status(400).json({ error: "GitHub token is required" });
    return;
  }
  const result = await builderService.syncToGitHub(token, projectId, body.token.trim());
  res.json(result);
}

export async function exportProject(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = getProjectIdParam(req);
  if (!projectId) {
    res.status(400).json({ error: "projectId is required" });
    return;
  }
  const { stream, projectName } = await builderService.exportProjectZipStream(token, projectId);
  const safeName = projectName.replace(/[^a-zA-Z0-9_\-.]/g, "-") || "project";
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.zip"`);
  stream.pipe(res);
}

export async function publishVercel(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  const projectId = getProjectIdParam(req);
  const body = req.body as { token?: string };
  if (!body.token?.trim()) {
    res.status(400).json({ error: "Vercel token is required" });
    return;
  }
  const result = await builderService.publishToVercel(token, projectId, body.token.trim());
  res.json(result);
}

export async function getInstantOffer(req: Request, res: Response): Promise<void> {
  const token = getAccessToken(req);
  if (!token) throw unauthorized("Authentication required");
  if (!req.user?.id) throw unauthorized("User not found");
  const projectId = getProjectIdParam(req);

  const supabase = getSupabaseClientWithAuth(token);
  const { data: row, error } = await supabase
    .from("builder_projects")
    .select("id, name, description, progress_score, traction_signals, why_built, framework")
    .eq("id", projectId)
    .maybeSingle();

  if (error || !row) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const project = row as {
    id: string;
    name: string;
    description: string | null;
    progress_score: number;
    traction_signals: Array<{ type: string; description: string }>;
    why_built: string | null;
    framework: string;
  };

  const prompt = `You are a startup acquisition advisor. Based on the project below, provide a realistic valuation offer range (low and high in USD) that a typical acqui-hire or micro-acquisition buyer might offer.

Project: ${project.name}
Description: ${project.description ?? "N/A"}
Why built: ${project.why_built ?? "N/A"}
Framework: ${project.framework}
Progress score: ${project.progress_score}/100
Traction signals: ${JSON.stringify(project.traction_signals ?? [])}

Respond ONLY with valid JSON in this exact shape:
{
  "offerLow": <number>,
  "offerHigh": <number>,
  "reasoning": "<2-3 sentence explanation>",
  "signals": {
    "strengths": ["<strength1>", "<strength2>"],
    "risks": ["<risk1>", "<risk2>"]
  }
}`;

  let offerLow = 0;
  let offerHigh = 0;
  let reasoning = "Valuation not available at this time.";
  let signals: { strengths: string[]; risks: string[] } = { strengths: [], risks: [] };

  try {
    const aiRaw = await chatService.generateInstantOffer(prompt);
    const parsed = JSON.parse(aiRaw) as {
      offerLow?: number;
      offerHigh?: number;
      reasoning?: string;
      signals?: { strengths?: string[]; risks?: string[] };
    };
    offerLow = typeof parsed.offerLow === "number" ? parsed.offerLow : 0;
    offerHigh = typeof parsed.offerHigh === "number" ? parsed.offerHigh : 0;
    reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : reasoning;
    const sig = parsed.signals;
    signals = {
      strengths: Array.isArray(sig?.strengths) ? (sig as { strengths: string[] }).strengths : [],
      risks: Array.isArray(sig?.risks) ? (sig as { risks: string[] }).risks : [],
    };
  } catch {
    // Use fallback values
  }

  // Persist offer to DB and update project valuation
  if (offerLow > 0) {
    await supabase.from("offers").insert({
      project_id: projectId,
      user_id: req.user.id,
      offer_low: offerLow,
      offer_high: offerHigh,
      reasoning,
      signals,
    });
    await supabase
      .from("builder_projects")
      .update({ valuation_low: offerLow, valuation_high: offerHigh, updated_at: new Date().toISOString() })
      .eq("id", projectId);
  }

  res.json({ offerLow, offerHigh, reasoning, signals });
}
