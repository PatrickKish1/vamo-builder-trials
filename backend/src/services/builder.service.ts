import { randomBytes } from "crypto";
import archiver from "archiver";
import { getSupabaseClientWithAuth, getSupabaseServiceClient } from "../config/supabase.js";
import { env } from "../config/env.js";
import { AppError, badRequest, dbError, notFound } from "../utils/errors.js";
import type { Sandbox } from "e2b";
import {
  BUILDER_SEED_PATH,
  deleteAllProjectFilesFromDb,
  deleteFileFromDb,
  getOrCreateBuilderSandbox,
  getProjectFilesFromDb,
  getProjectWorkdir,
  killBuilderSandbox,
  listSandboxFilesRecurse,
  pauseBuilderSandbox as pauseSandboxById,
  persistFilesToDb,
  restoreFilesToSandbox,
  type SandboxFile,
} from "./builder-sandbox.service.js";

const SCAFFOLD_USER_MESSAGE = "Project setup failed. Please try again.";

/** Log stream tag for E2B command output so we can trace scaffold/preview progress in logs. */
function commandStreamLogger(tag: string): { onStdout: (data: string) => void; onStderr: (data: string) => void } {
  return {
    onStdout: (data: string) => {
      const line = (data ?? "").trim();
      if (line) console.log(`[builder][${tag}]`, line);
    },
    onStderr: (data: string) => {
      const line = (data ?? "").trim();
      if (line) console.warn(`[builder][${tag}]`, line);
    },
  };
}


export interface BuilderProjectResponse {
  id: string;
  name: string;
  description: string | null;
  framework: string;
  status: string;
  previewUrl: string | null;
  previewPort: number | null;
  projectPath: string | null;
  progressScore: number;
  tractionSignals: Array<{ type: string; description: string; createdAt: string }>;
  linkedAssets: Array<{ type: string; url: string; label?: string }>;
  recentActivity: Array<{ type: string; description: string; createdAt: string }>;
  founderName: string | null;
  whyBuilt: string | null;
  logoUrl: string | null;
  valuationLow: number | null;
  valuationHigh: number | null;
  createdAt: string;
  updatedAt: string;
  projectRole?: "owner" | "collaborator";
  collaboratorPermission?: "view" | "edit";
  /** Last agent response (planning, completion summary, or follow-up). Shown on Builder Chat tab. */
  agentSummary?: string | null;
}

/** Slim project data for list view - excludes heavy fields like tractionSignals, linkedAssets, recentActivity. */
export interface BuilderProjectListItem {
  id: string;
  name: string;
  framework: string;
  status: string;
  progressScore: number;
  logoUrl: string | null;
  updatedAt: string;
  pineappleCount: number;
}

export interface BuilderCollaboratorRow {
  id: string;
  projectId: string;
  email: string;
  invitedByUserId: string;
  permission: "view" | "edit";
  acceptedAt: string | null;
  invitedUserId: string | null;
  createdAt: string;
}

export interface InviteInfo {
  projectId: string;
  projectName: string;
  inviterEmail?: string;
}

function parseJsonArray<T>(val: unknown, fallback: T[]): T[] {
  if (Array.isArray(val)) return val as T[];
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function rowToBuilderProject(
  row: Record<string, unknown>,
  livePreviewUrl?: string | null
): BuilderProjectResponse {
  const id = row.id as string;
  const emptyTraction: Array<{ type: string; description: string; createdAt: string }> = [];
  const emptyAssets: Array<{ type: string; url: string; label?: string }> = [];
  const emptyActivity: Array<{ type: string; description: string; createdAt: string }> = [];
  const previewUrl =
    livePreviewUrl !== undefined ? (livePreviewUrl ?? null) : ((row.preview_url as string) ?? null);
  return {
    id,
    name: row.name as string,
    description: (row.description as string) ?? null,
    framework: (row.framework as string) ?? "nextjs",
    status: (row.status as string) ?? "scaffolding",
    previewUrl,
    previewPort: (row.preview_port as number) ?? null,
    projectPath: (row.project_path as string) ?? null,
    progressScore: typeof row.progress_score === "number" ? row.progress_score : 0,
    tractionSignals: parseJsonArray(row.traction_signals, emptyTraction),
    linkedAssets: parseJsonArray(row.linked_assets, emptyAssets),
    recentActivity: parseJsonArray(row.recent_activity, emptyActivity),
    founderName: (row.founder_name as string) ?? null,
    whyBuilt: (row.why_built as string) ?? null,
    logoUrl: (row.logo_url as string) ?? null,
    valuationLow: typeof row.valuation_low === "number" ? row.valuation_low : null,
    valuationHigh: typeof row.valuation_high === "number" ? row.valuation_high : null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    agentSummary: (row.agent_summary as string) ?? null,
  };
}

export async function listBuilderProjects(
  accessToken: string,
  projectId?: string | null,
  userId?: string | null
): Promise<{ projects?: BuilderProjectListItem[]; project?: BuilderProjectResponse | null }> {
  const supabase = getSupabaseClientWithAuth(accessToken);

  if (projectId) {
    const { data, error } = await supabase
      .from("builder_projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();
    if (error) throw dbError("Failed to load project. Please try again.");
    if (!data) return { project: null };
    const row = data as Record<string, unknown>;
    const project = rowToBuilderProject(row) as BuilderProjectResponse;
    if (userId) {
      if (row.owner_id === userId) {
        project.projectRole = "owner";
      } else {
        const { data: collab } = await supabase
          .from("builder_project_collaborators")
          .select("permission")
          .eq("project_id", projectId)
          .eq("invited_user_id", userId)
          .not("accepted_at", "is", null)
          .maybeSingle();
        if (collab) {
          project.projectRole = "collaborator";
          project.collaboratorPermission = (collab.permission as "view" | "edit") ?? "view";
        }
      }
    }
    project.logoUrl = await resolveLogoUrl(project.logoUrl);
    return { project };
  }

  const { data, error } = await supabase
    .from("builder_projects")
    .select("id, name, framework, status, progress_score, logo_url, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw dbError("Failed to load projects. Please try again.");
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const projectIds = rows.map((r) => r.id as string);

  const pineappleByProject: Record<string, number> = {};
  if (projectIds.length > 0) {
    const { data: ledgerRows } = await supabase
      .from("reward_ledger")
      .select("project_id, reward_amount")
      .in("project_id", projectIds);
    for (const r of ledgerRows ?? []) {
      const pid = r.project_id as string;
      if (pid) {
        pineappleByProject[pid] = (pineappleByProject[pid] ?? 0) + (Number(r.reward_amount) || 0);
      }
    }
  }

  const projects: BuilderProjectListItem[] = [];
  for (const row of rows) {
    const id = row.id as string;
    const logoUrl = await resolveLogoUrl((row.logo_url as string) ?? null);
    projects.push({
      id,
      name: (row.name as string) ?? "",
      framework: (row.framework as string) ?? "nextjs",
      status: (row.status as string) ?? "scaffolding",
      progressScore: typeof row.progress_score === "number" ? row.progress_score : 0,
      logoUrl,
      updatedAt: (row.updated_at as string) ?? "",
      pineappleCount: Math.max(0, pineappleByProject[id] ?? 0),
    });
  }
  return { projects };
}

export async function createBuilderProject(
  accessToken: string,
  userId: string,
  params: {
    name: string;
    description?: string;
    framework?: string;
    logoUrl?: string | null;
    logoPrompt?: string;
  }
): Promise<{ project: BuilderProjectResponse }> {
  const { name, description, framework, logoUrl } = params;
  if (!name?.trim()) throw badRequest("Project name is required");

  const supabase = getSupabaseClientWithAuth(accessToken);
  const insert: Record<string, unknown> = {
    name: name.trim(),
    description: description ?? "",
    framework: framework ?? "nextjs",
    status: "scaffolding",
    owner_id: userId,
  };
  if (logoUrl != null && logoUrl !== "") insert.logo_url = logoUrl;

  let result = await supabase.from("builder_projects").insert(insert).select().single();
  if (result.error && (result.error.message?.includes("column") || result.error.code === "42703")) {
    delete insert.logo_url;
    result = await supabase.from("builder_projects").insert(insert).select().single();
  }
  const { data, error } = result;
  if (error) {
    console.error("[builder] createBuilderProject Supabase error:", error.code, error.message, error.details);
    throw dbError("Failed to create project. Please try again.");
  }
  const row = data as Record<string, unknown>;
  const project = rowToBuilderProject(row);
  project.logoUrl = await resolveLogoUrl(project.logoUrl);
  return { project };
}

export async function cloneBuilderProject(
  accessToken: string,
  userId: string,
  sourceProjectId: string
): Promise<{ project: BuilderProjectResponse }> {
  if (!sourceProjectId?.trim()) throw badRequest("Source project ID is required");
  const supabase = getSupabaseClientWithAuth(accessToken);
  const supabaseService = getSupabaseServiceClient();

  const { data: source, error: sourceError } = await supabase
    .from("builder_projects")
    .select("id, name, description, framework, status")
    .eq("id", sourceProjectId)
    .single();
  if (sourceError || !source) throw notFound("Project not found");
  const sourceRow = source as Record<string, unknown>;

  const sourceFiles = await getProjectFilesFromDb(supabaseService, sourceProjectId);
  if (sourceFiles.length === 0) throw notFound("Source project has no files to clone");

  const { data: newProject, error: createError } = await supabase
    .from("builder_projects")
    .insert({
      name: `Copy of ${(sourceRow.name as string) ?? "Project"}`,
      description: (sourceRow.description as string) ?? "",
      framework: (sourceRow.framework as string) ?? "nextjs",
      status: "ready",
      owner_id: userId,
    })
    .select()
    .single();
  if (createError || !newProject) throw new AppError("Failed to create clone", 500);
  const newId = (newProject as { id: string }).id;

  await persistFilesToDb(supabaseService, newId, sourceFiles);
  return { project: rowToBuilderProject(newProject as Record<string, unknown>) };
}

export type UpdateBuilderProjectParams = {
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

export async function updateBuilderProject(
  accessToken: string,
  projectId: string,
  params: UpdateBuilderProjectParams
): Promise<{ project: BuilderProjectResponse }> {
  if (!projectId?.trim()) throw badRequest("Project ID is required");
  const supabase = getSupabaseClientWithAuth(accessToken);
  const { data: existing, error: fetchError } = await supabase
    .from("builder_projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (fetchError || !existing) throw notFound("Project not found");

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.founderName !== undefined) updates.founder_name = params.founderName;
  if (params.whyBuilt !== undefined) updates.why_built = params.whyBuilt;
  if (params.linkedAssets !== undefined) updates.linked_assets = JSON.stringify(params.linkedAssets);
  if (params.tractionSignals !== undefined) updates.traction_signals = JSON.stringify(params.tractionSignals);
  if (params.recentActivity !== undefined) updates.recent_activity = JSON.stringify(params.recentActivity);
  if (params.progressScore !== undefined) updates.progress_score = params.progressScore;
  if (params.logoUrl !== undefined) updates.logo_url = params.logoUrl;
  if (params.agentSummary !== undefined) updates.agent_summary = params.agentSummary;

  const { data, error } = await supabase
    .from("builder_projects")
    .update(updates)
    .eq("id", projectId)
    .select()
    .single();
  if (error) throw dbError("Failed to update project. Please try again.");
  return { project: rowToBuilderProject(data as Record<string, unknown>) };
}

export async function deleteBuilderProject(
  accessToken: string,
  projectId: string
): Promise<{ success: boolean }> {
  if (!projectId?.trim()) throw badRequest("Project ID is required");
  const supabase = getSupabaseClientWithAuth(accessToken);
  const supabaseService = getSupabaseServiceClient();
  const { data: project, error: fetchError } = await supabase
    .from("builder_projects")
    .select("id, sandbox_id")
    .eq("id", projectId)
    .single();
  if (fetchError || !project) throw notFound("Project not found");

  const storedSandboxId = (project as Record<string, unknown>).sandbox_id as string | null;
  await killBuilderSandbox(projectId, storedSandboxId);
  await deleteAllProjectFilesFromDb(supabaseService, projectId);

  await supabaseService.rpc("revoke_rewards_for_project", { p_project_id: projectId });

  const { error: deleteError } = await supabase.from("builder_projects").delete().eq("id", projectId);
  if (deleteError) throw deleteError;
  return { success: true };
}

/**
 * Clear stored sandbox_id for any project that had this E2B sandbox (e.g. after webhook reports killed).
 * Next time the project is used, a new sandbox will be created.
 */
export async function clearSandboxIdBySandboxId(sandboxId: string): Promise<void> {
  if (!sandboxId?.trim()) return;
  const supabaseService = getSupabaseServiceClient();
  await supabaseService
    .from("builder_projects")
    .update({ sandbox_id: null, updated_at: new Date().toISOString() })
    .eq("sandbox_id", sandboxId);
}

export async function scaffoldProject(
  accessToken: string,
  projectId: string,
  _description?: string
): Promise<{ success: boolean }> {
  const supabase = getSupabaseClientWithAuth(accessToken);
  const supabaseService = getSupabaseServiceClient();
  const { data: project, error: fetchError } = await supabase
    .from("builder_projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (fetchError || !project) throw notFound("Project not found");

  const framework = (project.framework as string) ?? "nextjs";
  const projectName = (project.name as string) ?? "project";
  const workdir = getProjectWorkdir(projectName);

  // Use pnpm dlx for one-off commands (pnpm equivalent of npx). E2B Node image may need corepack for pnpm.
  // Scaffold into /home/user/project/{projectName}/frontend so one sandbox can hold multiple projects.
  let scaffoldCommand: string;
  switch (framework) {
    case "nextjs":
      scaffoldCommand = `pnpm dlx create-next-app@latest ${workdir} --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --yes`;
      break;
    case "react":
      scaffoldCommand = `pnpm dlx create-react-app ${workdir} --template typescript`;
      break;
    case "vue":
      scaffoldCommand = `pnpm dlx create-vue@latest ${workdir} -- --typescript --jsx --router --pinia --yes`;
      break;
    case "angular":
      scaffoldCommand = `pnpm dlx @angular/cli@latest new project --directory ${workdir} --routing --style=css --skip-git --package-manager pnpm`;
      break;
    case "svelte":
      scaffoldCommand = `pnpm dlx create-svelte@latest ${workdir} -- --template skeleton --types ts --no-prettier --no-eslint --no-playwright --no-vitest`;
      break;
    default:
      throw badRequest(`Unsupported framework: ${framework}`);
  }

  await supabase
    .from("builder_projects")
    .update({ status: "scaffolding", updated_at: new Date().toISOString() })
    .eq("id", projectId);

  const storedSandboxId = (project as Record<string, unknown>).sandbox_id as string | null;

  try {
    console.log("[builder] Creating/connecting to E2B sandbox for scaffold, projectId:", projectId);
    const { sandbox, sandboxId } = await getOrCreateBuilderSandbox(projectId, storedSandboxId);
    console.log("[builder] E2B sandbox ready, sandboxId:", sandboxId);

    await supabase
      .from("builder_projects")
      .update({ sandbox_id: sandboxId, updated_at: new Date().toISOString() })
      .eq("id", projectId);

    const workdirEntries = (await sandbox.files.list(workdir).catch(() => [])) as Array<{ name: string; type: string }>;
    const hasPackageJson = workdirEntries.some((e) => e.name === "package.json");
    const hasNextConfig = workdirEntries.some((e) => e.name === "next.config.ts" || e.name === "next.config.js");
    const hasSrcOrApp = workdirEntries.some((e) => e.name === "src" || e.name === "app");
    const projectExistsOnSandbox = hasPackageJson || hasNextConfig || hasSrcOrApp;

    if (projectExistsOnSandbox) {
      console.log(
        "[builder] Project already on sandbox (workdir entries:",
        workdirEntries.length,
        "package.json:",
        hasPackageJson,
        "); recovering, projectId:",
        projectId
      );
      await sandbox.commands.run("corepack enable && corepack prepare pnpm@latest --activate", {
        timeoutMs: 60_000,
        cwd: "/home/user",
      });
      const componentsJsonPath = `${workdir}/components.json`;
      const hasShadcn = await sandbox.files.read(componentsJsonPath).catch(() => null);
      if (typeof hasShadcn !== "string" || !hasShadcn.trim()) {
        const recoverShadcnLog = commandStreamLogger("recover:shadcn");
        console.log("[builder] shadcn not found; running shadcn init in workdir");
        const initResult = await sandbox.commands.run("pnpm dlx shadcn@latest init --yes", {
          cwd: workdir,
          timeoutMs: 3 * 60 * 1000,
          onStdout: recoverShadcnLog.onStdout,
          onStderr: recoverShadcnLog.onStderr,
        });
        if (initResult.exitCode !== 0) {
          console.warn("[builder] shadcn init non-zero exit:", initResult.exitCode, initResult.stderr?.slice(-300));
        }
      }
      const snapshotFiles: SandboxFile[] = [];
      await listSandboxFilesRecurse(sandbox, workdir, "", snapshotFiles);
      const fileCount = snapshotFiles.filter((f) => !f.isFolder).length;
      if (fileCount === 0) {
        console.warn("[builder] Recover snapshot had 0 files; retrying after 2s");
        await new Promise((r) => setTimeout(r, 2000));
        snapshotFiles.length = 0;
        await listSandboxFilesRecurse(sandbox, workdir, "", snapshotFiles);
      }
      const finalCount = snapshotFiles.filter((f) => !f.isFolder).length;
      if (finalCount === 0) {
        console.error("[builder] Recover: no files after snapshot; setting error and returning (will not overwrite existing project)");
        await supabase
          .from("builder_projects")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", projectId);
        throw new AppError(
          "Project exists on sandbox but file sync failed. Try re-run scaffold again or contact support.",
          500,
          "SCAFFOLD_FAILED"
        );
      }
      await persistFilesToDb(supabaseService, projectId, snapshotFiles);
      const logoUrlRaw = (project as Record<string, unknown>).logo_url as string | null | undefined;
      if (logoUrlRaw?.trim()) {
        const resolvedLogo = await resolveLogoUrl(logoUrlRaw.trim());
        if (resolvedLogo) await writeProjectLogoAsAppIcon(sandbox, workdir, resolvedLogo);
      }
      await supabase
        .from("builder_projects")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", projectId);
      console.log("[builder] Recover complete for project:", projectId, "files:", finalCount, "status=ready");
      return { success: true };
    }

    console.log("[builder] No existing project on sandbox; full scaffold, projectId:", projectId);

    const seedEntries = (await sandbox.files.list(BUILDER_SEED_PATH).catch(() => [])) as Array<{ name: string }>;
    const seedHasPackageJson = seedEntries.some((e) => e.name === "package.json");
    if (seedHasPackageJson && env.e2bBuilderTemplateName) {
      console.log("[builder] Using pre-baked template seed for project:", projectId);
      const parentDir = workdir.replace(/\/[^/]+$/, "");
      await sandbox.commands.run(`mkdir -p ${parentDir}`, { timeoutMs: 5000, cwd: "/home/user" });
      const copyResult = await sandbox.commands.run(`cp -r ${BUILDER_SEED_PATH}/. ${workdir}`, {
        timeoutMs: 60_000,
        cwd: "/home/user",
      });
      if (copyResult.exitCode !== 0) {
        console.warn("[builder] Seed copy non-zero exit:", copyResult.exitCode, copyResult.stderr?.slice(-300));
        throw new AppError("Failed to copy template seed to project. Try again or use scaffold without template.", 500, "SCAFFOLD_FAILED");
      }
      console.log("[builder] Snapshot project files to DB for project (from seed):", projectId);
      const snapshotFiles: SandboxFile[] = [];
      await listSandboxFilesRecurse(sandbox, workdir, "", snapshotFiles);
      const fileCount = snapshotFiles.filter((f) => !f.isFolder).length;
      if (fileCount === 0) {
        throw new AppError("Template seed produced no files in workdir. Check E2B template.", 500, "SCAFFOLD_FAILED");
      }
      await persistFilesToDb(supabaseService, projectId, snapshotFiles);
      const logoUrlRaw = (project as Record<string, unknown>).logo_url as string | null | undefined;
      if (logoUrlRaw?.trim()) {
        const resolvedLogo = await resolveLogoUrl(logoUrlRaw.trim());
        if (resolvedLogo) await writeProjectLogoAsAppIcon(sandbox, workdir, resolvedLogo);
      }
      await supabase
        .from("builder_projects")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", projectId);
      console.log("[builder] Scaffold complete (from seed) for project:", projectId, "status=ready");
      return { success: true };
    }

    await sandbox.commands.run("corepack enable && corepack prepare pnpm@latest --activate", {
      timeoutMs: 60_000,
      cwd: "/home/user",
    });
    const cleanupResult = await sandbox.commands.run(`rm -rf ${workdir}`, {
      timeoutMs: 30_000,
      cwd: "/home/user",
    });
    if (cleanupResult.exitCode !== 0) {
      console.warn("[builder] Cleanup workdir non-zero exit:", cleanupResult.exitCode, cleanupResult.stderr?.slice(-500));
    }
    const parentDir = workdir.replace(/\/[^/]+$/, "");
    await sandbox.commands.run(`mkdir -p ${parentDir}`, { timeoutMs: 5000, cwd: "/home/user" });

    const checkScaffoldDone = async (): Promise<boolean> => {
      const entries = (await sandbox.files.list(workdir).catch(() => [])) as Array<{ name: string }>;
      return entries.some((e) => e.name === "package.json");
    };

    const createNextAppLog = commandStreamLogger("scaffold:create-next-app");
    console.log("[builder] Running create-next-app (background) for project:", projectId);
    const scaffoldHandle = await sandbox.commands.run(scaffoldCommand, {
      cwd: "/home/user",
      background: true,
      onStdout: createNextAppLog.onStdout,
      onStderr: createNextAppLog.onStderr,
    });
    const scaffoldDeadline = Date.now() + 12 * 60 * 1000;
    const scaffoldPollMs = 15_000;
    while (Date.now() < scaffoldDeadline) {
      await new Promise((r) => setTimeout(r, scaffoldPollMs));
      if (await checkScaffoldDone()) {
        console.log("[builder] create-next-app completed (package.json present) for project:", projectId);
        break;
      }
      try {
        const result = await Promise.race([
          scaffoldHandle.wait(),
          new Promise<{ exitCode?: number } | null>((res) => setTimeout(() => res(null), 3000)),
        ]);
        if (result != null && result.exitCode !== undefined) {
          if (result.exitCode !== 0) {
            const stderr = (scaffoldHandle as { stderr?: string }).stderr ?? "";
            console.error("[builder] create-next-app exited non-zero:", result.exitCode, stderr?.slice(-500));
            throw new AppError(
              `Project setup failed. ${stderr.split("\n").slice(-2).join(" ").slice(0, 180)}`,
              500,
              "SCAFFOLD_FAILED"
            );
          }
          break;
        }
      } catch (e) {
        if (e instanceof AppError) throw e;
      }
    }
    if (!(await checkScaffoldDone())) {
      try {
        await scaffoldHandle.kill();
      } catch {
        /* ignore */
      }
      throw new AppError(
        "Project setup did not complete in time. The sandbox may be under load. Try again in a moment.",
        500,
        "SCAFFOLD_FAILED"
      );
    }

    if (framework === "nextjs") {
      const installPollMs = 15_000;
      const installMaxWaitMs = 8 * 60 * 1000;
      const scaffoldHasNodeModules = async (): Promise<boolean> => {
        const list = await sandbox.files.list(`${workdir}/node_modules`).catch(() => []);
        return Array.isArray(list) && list.length > 0;
      };
      const scaffoldPnpmLog = commandStreamLogger("scaffold:pnpm");
      for (let attempt = 1; attempt <= 2; attempt++) {
        const installCmd = attempt > 1 ? "pnpm install --prefer-offline" : "pnpm install";
        console.log("[builder] pnpm install (background) in scaffold, attempt", attempt, "for project:", projectId);
        const installHandle = await sandbox.commands.run(installCmd, {
          cwd: workdir,
          background: true,
          onStdout: scaffoldPnpmLog.onStdout,
          onStderr: scaffoldPnpmLog.onStderr,
        });
        const installDeadline = Date.now() + installMaxWaitMs;
        while (Date.now() < installDeadline) {
          await new Promise((r) => setTimeout(r, installPollMs));
          if (await scaffoldHasNodeModules()) {
            console.log("[builder] scaffold pnpm install completed for project:", projectId);
            break;
          }
          try {
            const res = await Promise.race([
              installHandle.wait(),
              new Promise<never>((_, rej) => setTimeout(() => rej(new Error("wait_timeout")), 2000)),
            ]);
            if (res?.exitCode === 0) break;
          } catch {
            /* keep polling */
          }
        }
        if (await scaffoldHasNodeModules()) break;
        try {
          await installHandle.kill();
        } catch {
          /* ignore */
        }
        if (attempt === 2) console.warn("[builder] scaffold pnpm install did not complete; preview start will retry.");
        else await new Promise((r) => setTimeout(r, 3000));
      }
      const shadcnLog = commandStreamLogger("scaffold:shadcn");
      try {
        console.log("[builder] shadcn init in scaffold (nextjs) for project:", projectId);
        const initResult = await sandbox.commands.run("pnpm dlx shadcn@latest init --yes", {
          cwd: workdir,
          timeoutMs: 3 * 60 * 1000,
          onStdout: shadcnLog.onStdout,
          onStderr: shadcnLog.onStderr,
        });
        if (initResult.exitCode !== 0) {
          console.warn("[builder] shadcn init non-zero exit:", initResult.exitCode, initResult.stderr?.slice(-300));
        }
      } catch (shadcnErr) {
        console.warn("[builder] shadcn init failed (continuing):", shadcnErr instanceof Error ? shadcnErr.message : String(shadcnErr));
      }
    }

    console.log("[builder] Snapshot project files to DB for project:", projectId);
    let snapshotFiles: SandboxFile[] = [];
    await listSandboxFilesRecurse(sandbox, workdir, "", snapshotFiles);
    let fileCount = snapshotFiles.filter((f) => !f.isFolder).length;
    if (fileCount === 0) {
      console.warn("[builder] First snapshot had 0 files; retrying after 3s (sandbox may still be writing)");
      await new Promise((r) => setTimeout(r, 3000));
      snapshotFiles = [];
      await listSandboxFilesRecurse(sandbox, workdir, "", snapshotFiles);
      fileCount = snapshotFiles.filter((f) => !f.isFolder).length;
    }
    console.log("[builder] Snapshot collected", snapshotFiles.length, "entries,", fileCount, "files");

    if (fileCount === 0) {
      console.error("[builder] No files collected from sandbox after retry; workdir:", workdir);
      await supabase
        .from("builder_projects")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("id", projectId);
      throw new AppError("Scaffold produced no files. Check E2B sandbox and create-next-app output.", 500, "SCAFFOLD_FAILED");
    }

    await persistFilesToDb(supabaseService, projectId, snapshotFiles);

    const logoUrlRaw = (project as Record<string, unknown>).logo_url as string | null | undefined;
    if (logoUrlRaw?.trim()) {
      const resolvedLogo = await resolveLogoUrl(logoUrlRaw.trim());
      if (resolvedLogo) await writeProjectLogoAsAppIcon(sandbox, workdir, resolvedLogo);
    }

    await supabase
      .from("builder_projects")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", projectId);

    console.log("[builder] Scaffold complete for project:", projectId, "status=ready");
    return { success: true };
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error("[builder] scaffold failed:", err);
    await supabase
      .from("builder_projects")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", projectId);
    const resultStdout = (err as { result?: { stdout?: string } }).result?.stdout?.trim().slice(-400) ?? "";
    const message =
      err instanceof Error
        ? err.message.includes("E2B_API_KEY")
          ? "E2B is not configured. Add E2B_API_KEY to the backend .env (get a key at e2b.dev)."
          : resultStdout
            ? resultStdout.split("\n").slice(-4).join(" ").slice(0, 220)
            : err.message.length <= 200
              ? err.message
              : SCAFFOLD_USER_MESSAGE
        : SCAFFOLD_USER_MESSAGE;
    throw new AppError(message, 500, "SCAFFOLD_FAILED");
  }
}

/** Strip E2B/sandbox identifiers from log output so we never expose provider or sandbox id. */
function sanitizePreviewOutput(raw: string): string {
  return raw
    .replace(/\b[a-z0-9]{20,}\.e2b\.app\b/gi, "[preview-host]")
    .replace(/e2b\.app/gi, "[preview]")
    .replace(/\bsandbox\s+[a-zA-Z0-9_-]+\s+is\s+running/gi, "sandbox is running")
    .replace(/"sandboxId"\s*:\s*"[^"]+"/gi, '"sandboxId":"[hidden]"')
    .replace(/\bsandboxId["\s:]+[a-zA-Z0-9_-]{10,}/gi, "sandboxId: [hidden]")
    .replace(/\b[a-z0-9]{15,32}\b(?=\s*\.e2b\.|.*port is not open)/gi, "[id]");
}

export async function getPreviewErrors(
  accessToken: string,
  projectId: string
): Promise<{ output: string; hasErrors: boolean } | null> {
  const supabase = getSupabaseClientWithAuth(accessToken);
  const { data: project, error } = await supabase
    .from("builder_projects")
    .select("sandbox_id")
    .eq("id", projectId)
    .single();
  if (error || !project) return null;
  const storedSandboxId = (project as Record<string, unknown>).sandbox_id as string | null;
  if (!storedSandboxId) return null;
  try {
    const { sandbox } = await getOrCreateBuilderSandbox(projectId, storedSandboxId);
    const content = (await sandbox.files.read("/tmp/dev.log").catch(() => "")) as string;
    if (!content) return null;
    const trimmed = content.slice(-12000);
    const hasErrors = /error|Error|Module not found|Can't resolve|ENOENT|failed|Failed/i.test(trimmed);
    const sanitized = sanitizePreviewOutput(trimmed);
    return { output: sanitized, hasErrors };
  } catch {
    return null;
  }
}

export async function startPreview(
  accessToken: string,
  projectId: string
): Promise<{ previewUrl: string; previewPort: number }> {
  const supabase = getSupabaseClientWithAuth(accessToken);
  const supabaseService = getSupabaseServiceClient();

  const { data: project, error } = await supabase
    .from("builder_projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (error || !project) throw notFound("Project not found");

  const storedSandboxId = (project as Record<string, unknown>).sandbox_id as string | null;
  const { sandbox, sandboxId, isNew } = await getOrCreateBuilderSandbox(projectId, storedSandboxId);

  if (sandboxId !== storedSandboxId) {
    await supabase
      .from("builder_projects")
      .update({ sandbox_id: sandboxId, updated_at: new Date().toISOString() })
      .eq("id", projectId);
  }

  const projectName = (project as Record<string, unknown>).name as string ?? "project";
  const workdir = getProjectWorkdir(projectName);

  /** Run pnpm install in background and poll for node_modules so E2B does not kill a single long-running command. */
  const runPnpmInstallWithPoll = async (): Promise<void> => {
    const pollIntervalMs = 15_000;
    const maxWaitMs = 8 * 60 * 1000;
    const checkNodeModules = async (): Promise<boolean> => {
      const list = await sandbox.files.list(`${workdir}/node_modules`).catch(() => []);
      return Array.isArray(list) && list.length > 0;
    };
    const previewPnpmLog = commandStreamLogger("preview:pnpm");
    for (let attempt = 1; attempt <= 2; attempt++) {
      const installCmd = attempt > 1 ? "pnpm install --prefer-offline" : "pnpm install";
      console.log("[builder] pnpm install (background) attempt", attempt, "for project:", projectId);
      const handle = await sandbox.commands.run(installCmd, {
        cwd: workdir,
        background: true,
        onStdout: previewPnpmLog.onStdout,
        onStderr: previewPnpmLog.onStderr,
      });
      const deadline = Date.now() + maxWaitMs;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        if (await checkNodeModules()) {
          console.log("[builder] pnpm install completed (node_modules present) for project:", projectId);
          return;
        }
        try {
          const result = await Promise.race([
            handle.wait(),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("wait_timeout")), 2000)),
          ]);
          if (result?.exitCode === 0) {
            console.log("[builder] pnpm install process exited 0 for project:", projectId);
            return;
          }
        } catch {
          /* still running or timeout; keep polling */
        }
      }
      try {
        await handle.kill?.();
      } catch {
        /* ignore */
      }
      console.warn("[builder] pnpm install attempt", attempt, "did not complete within", maxWaitMs / 60000, "min");
      if (attempt === 2) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (await checkNodeModules()) return;
    throw new AppError(
      "Dependency install was interrupted in the preview environment. Please try starting the preview again.",
      503,
      "PREVIEW_INSTALL_FAILED"
    );
  };

  if (isNew) {
    const files = await getProjectFilesFromDb(supabaseService, projectId);
    if (files.length === 0) throw notFound("Project has no files. Run scaffold first.");
    console.log("[builder] Restoring", files.length, "files to fresh sandbox for project:", projectId);
    await restoreFilesToSandbox(sandbox, files, workdir);
    console.log("[builder] Installing dependencies in sandbox for project:", projectId);
    await runPnpmInstallWithPoll();
  } else {
    const nodeModulesExists = await sandbox.files.list(`${workdir}/node_modules`).then((e) => (e as unknown[]).length > 0).catch(() => false);
    if (!nodeModulesExists) {
      console.log("[builder] node_modules missing in sandbox; running pnpm install for project:", projectId);
      await runPnpmInstallWithPoll();
    }
  }

  const framework = (project as Record<string, unknown>).framework as string ?? "nextjs";
  const buildDevCommand = (port: number): string => {
    switch (framework) {
      case "nextjs":
        return `pnpm run dev -- -p ${port} --hostname 0.0.0.0`;
      case "react":
        return `PORT=${port} pnpm start`;
      case "vue":
      case "svelte":
        return `pnpm run dev -- --port ${port} --host 0.0.0.0`;
      case "angular":
        return `pnpm exec ng serve --port ${port} --host 0.0.0.0`;
      default:
        return `pnpm run dev -- -p ${port} --hostname 0.0.0.0`;
    }
  };

  const checkPortListening = async (port: number): Promise<boolean> => {
    const result = await sandbox.commands.run(
      `curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 http://127.0.0.1:${port} 2>/dev/null || echo "000"`,
      { cwd: workdir, timeoutMs: 5000 }
    );
    const code = (result.stdout ?? "").trim();
    return code === "200" || code === "304" || code === "301" || code === "302";
  };

  const killExistingDev = async (): Promise<void> => {
    await sandbox.commands.run(
      "pkill -f 'next dev' || pkill -f 'node.*next' || true; sleep 1",
      { cwd: workdir, timeoutMs: 10000 }
    ).catch(() => {});
  };

  const startPort = (project as Record<string, unknown>).preview_port as number | null;
  const portsToTry = startPort != null && startPort >= 3000 && startPort <= 3010
    ? [startPort, ...Array.from({ length: 11 }, (_, i) => 3000 + i).filter((p) => p !== startPort)]
    : [3000, 3001, 3002, 3003, 3004, 3005];

  let chosenPort = 3000;
  let serverUp = false;

  await killExistingDev();

  for (const port of portsToTry) {
    chosenPort = port;
    const devCommand = buildDevCommand(port);
    console.log("[builder] Starting dev server in sandbox for project:", projectId, "port:", port);
    await sandbox.commands.run(
      `nohup ${devCommand} > /tmp/dev.log 2>&1 &`,
      { cwd: workdir, timeoutMs: 15000 }
    );
    for (let wait = 0; wait < 35; wait += 5) {
      await new Promise((r) => setTimeout(r, 5000));
      if (await checkPortListening(port)) {
        serverUp = true;
        break;
      }
    }
    if (serverUp) break;
    await killExistingDev();
  }

  if (!serverUp) {
    console.warn("[builder] Dev server did not become ready on any tried port; returning first port for retry");
  }

  const host = sandbox.getHost(chosenPort);
  const directUrl = host.startsWith("http") ? host : `https://${host}`;

  await supabase
    .from("builder_projects")
    .update({
      preview_url: directUrl,
      preview_port: chosenPort,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  return { previewUrl: directUrl, previewPort: chosenPort };
}

export const PREVIEW_PROXY_GENERIC_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preview</title></head><body style="font-family:system-ui;padding:2rem;text-align:center;color:#666;"><p>Preview server isn't running.</p><p>Start the preview server from the builder, or try again in a moment.</p></body></html>`;

/**
 * Proxy a request to the project's preview URL (sandbox). Use this so the client never sees E2B hostnames or sandbox IDs.
 * On connection error returns 503 with generic HTML (no provider/sandbox details).
 */
export async function proxyPreviewRequest(
  accessToken: string,
  projectId: string,
  pathToForward: string
): Promise<{ status: number; body: string | Buffer; contentType?: string }> {
  const supabase = getSupabaseClientWithAuth(accessToken);
  const { data: project, error } = await supabase
    .from("builder_projects")
    .select("preview_url")
    .eq("id", projectId)
    .single();
  if (error || !project) throw notFound("Project not found");
  const baseUrl = (project as Record<string, unknown>).preview_url as string | null;
  if (!baseUrl?.trim()) {
    return { status: 503, body: PREVIEW_PROXY_GENERIC_HTML, contentType: "text/html; charset=utf-8" };
  }
  const base = baseUrl.replace(/\/$/, "");
  const path = pathToForward.startsWith("/") ? pathToForward : `/${pathToForward}`;
  const targetUrl = `${base}${path}`;
  try {
    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    if (res.status >= 400) {
      return { status: 503, body: PREVIEW_PROXY_GENERIC_HTML, contentType: "text/html; charset=utf-8" };
    }
    const contentType = res.headers.get("content-type") ?? undefined;
    const body = await res.arrayBuffer();
    return { status: res.status, body: Buffer.from(body), contentType: contentType ?? undefined };
  } catch {
    return { status: 503, body: PREVIEW_PROXY_GENERIC_HTML, contentType: "text/html; charset=utf-8" };
  }
}

const RUN_COMMAND_ALLOWED =
  /^pnpm\s+(add|install|run)\s+[\w\s@./-]+$|^pnpm\s+(dlx|exec)\s+[\w@./\s-]+$|^pnpm\s+(list|why|outdated)(\s+[\w@./\s-]*)?$/i;
const RUN_COMMAND_FORBIDDEN = /[;&|`$<>]|\.\./;

const SHADCN_ADD_PATTERN = /^pnpm\s+(dlx|exec)\s+shadcn@?\w*\s+add\s+/i;

export async function runProjectCommand(
  accessToken: string,
  projectId: string,
  command: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const raw = command.trim();
  if (!raw) throw badRequest("Command is required");
  if (RUN_COMMAND_FORBIDDEN.test(raw)) throw badRequest("Command contains disallowed characters");
  if (!RUN_COMMAND_ALLOWED.test(raw)) {
    throw badRequest(
      "Allowed: pnpm add|install|run, pnpm dlx|exec, pnpm list|why|outdated"
    );
  }

  const supabase = getSupabaseClientWithAuth(accessToken);
  const supabaseService = getSupabaseServiceClient();
  const { data: project, error } = await supabase
    .from("builder_projects")
    .select("id, sandbox_id, name")
    .eq("id", projectId)
    .single();
  if (error || !project) throw notFound("Project not found");

  const projectName = (project as Record<string, unknown>).name as string ?? "project";
  const workdir = getProjectWorkdir(projectName);
  const storedSandboxId = (project as Record<string, unknown>).sandbox_id as string | null;
  const { sandbox, sandboxId, isNew } = await getOrCreateBuilderSandbox(projectId, storedSandboxId);

  if (sandboxId !== storedSandboxId) {
    await supabase
      .from("builder_projects")
      .update({ sandbox_id: sandboxId })
      .eq("id", projectId);
  }

  if (isNew) {
    const files = await getProjectFilesFromDb(supabaseService, projectId);
    if (files.length > 0) {
      await restoreFilesToSandbox(sandbox, files, workdir);
      await sandbox.commands.run("pnpm install", {
        cwd: workdir,
        timeoutMs: 5 * 60 * 1000,
      });
    }
  }

  if (SHADCN_ADD_PATTERN.test(raw)) {
    const checkResult = await sandbox.commands.run(
      `test -f ${workdir}/components.json && echo "exists" || echo "missing"`,
      { cwd: workdir, timeoutMs: 5000 }
    );
    if (checkResult.stdout.trim() === "missing") {
      const initResult = await sandbox.commands.run("pnpm dlx shadcn@latest init --yes", {
        cwd: workdir,
        timeoutMs: 3 * 60 * 1000,
      });
      if (initResult.exitCode !== 0) {
        return {
          stdout: "",
          stderr: initResult.stderr + "\n(shadcn init failed, then run the add command again.)",
          exitCode: 1,
        };
      }
    }
  }

  const result = await sandbox.commands.run(raw, {
    cwd: workdir,
    timeoutMs: 5 * 60 * 1000,
  });

  if (result.exitCode === 0) {
    const syncFiles: SandboxFile[] = [];
    await listSandboxFilesRecurse(sandbox, workdir, "", syncFiles);
    const syncCount = syncFiles.filter((f) => !f.isFolder).length;
    if (syncCount > 0) {
      await persistFilesToDb(supabaseService, projectId, syncFiles);
      console.log("[builder] Synced", syncCount, "files from sandbox to DB after run command");
    }
  }

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.exitCode ?? 0,
  };
}

function sanitizeRelativePath(relativePath: string): string {
  const parts = relativePath.split(/[/\\]/);
  const safe = parts.filter((p) => p !== ".." && p !== ".").join("/");
  if (!safe || safe.startsWith("/")) throw badRequest("Invalid path");
  return safe;
}

export type BuilderFileAction = "create" | "update" | "delete";

export async function applyBuilderFileAction(
  accessToken: string,
  params: {
    projectId: string;
    action: BuilderFileAction;
    path: string;
    content?: string;
  }
): Promise<{ ok: boolean }> {
  const { projectId, action, path: filePath, content } = params;
  if (!projectId?.trim()) throw badRequest("Project ID is required");
  if (!filePath?.trim()) throw badRequest("Path is required");

  const supabase = getSupabaseClientWithAuth(accessToken);
  const supabaseService = getSupabaseServiceClient();
  const { data: project, error } = await supabase
    .from("builder_projects")
    .select("id, sandbox_id, name")
    .eq("id", projectId)
    .single();
  if (error || !project) throw notFound("Project not found");

  const projectName = (project as Record<string, unknown>).name as string ?? "project";
  const workdir = getProjectWorkdir(projectName);
  const safePath = sanitizeRelativePath(filePath);
  const sandboxPath = `${workdir}/${safePath}`;
  const storedSandboxId = (project as Record<string, unknown>).sandbox_id as string | null;

  if (action === "delete") {
    await deleteFileFromDb(supabaseService, projectId, safePath);
    const { sandbox } = await getOrCreateBuilderSandbox(projectId, storedSandboxId).catch(() => ({ sandbox: null }));
    if (sandbox) await sandbox.files.remove(sandboxPath).catch(() => {});
    return { ok: true };
  }

  const contentToWrite = content ?? "";
  if (action === "update" && contentToWrite.trim() === "") {
    throw badRequest("Update action requires non-empty content; refusing to overwrite file with empty content.");
  }

  await persistFilesToDb(supabaseService, projectId, [{ path: safePath, content: contentToWrite, isFolder: false }]);

  const { sandbox } = await getOrCreateBuilderSandbox(projectId, storedSandboxId).catch(() => ({ sandbox: null }));
  if (sandbox) await sandbox.files.write(sandboxPath, contentToWrite).catch(() => {});

  return { ok: true };
}

export async function listBuilderFiles(
  accessToken: string,
  projectId: string
): Promise<{ files: Array<{ path: string; content: string; isFolder: boolean }> }> {
  if (!projectId?.trim()) throw badRequest("Project ID is required");
  const supabase = getSupabaseClientWithAuth(accessToken);
  const { data: project, error } = await supabase
    .from("builder_projects")
    .select("id")
    .eq("id", projectId)
    .single();
  if (error || !project) throw notFound("Project not found");
  const supabaseService = getSupabaseServiceClient();
  const files = await getProjectFilesFromDb(supabaseService, projectId);
  return { files };
}

/** Pause the project's E2B sandbox (saves state; resume on next connect). Call when user leaves build page or after inactivity. */
export async function pauseProjectSandbox(
  accessToken: string,
  projectId: string
): Promise<{ paused: boolean }> {
  if (!projectId?.trim()) throw badRequest("Project ID is required");
  const supabase = getSupabaseClientWithAuth(accessToken);
  const { data: project, error } = await supabase
    .from("builder_projects")
    .select("sandbox_id")
    .eq("id", projectId)
    .single();
  if (error || !project) throw notFound("Project not found");
  const sandboxId = (project as Record<string, unknown>).sandbox_id as string | null;
  if (!sandboxId?.trim()) return { paused: false };
  const paused = await pauseSandboxById(sandboxId);
  return { paused };
}

/**
 * Sync project files from E2B sandbox into DB. Use when project is "ready" but DB has no files (e.g. recover didn't persist).
 * Returns whether we found the project on sandbox and persisted files.
 */
export async function syncProjectFromSandbox(
  accessToken: string,
  projectId: string
): Promise<{ success: boolean; fileCount?: number; reason?: "no_sandbox" | "no_project" | "no_files" }> {
  if (!projectId?.trim()) throw badRequest("Project ID is required");
  const supabase = getSupabaseClientWithAuth(accessToken);
  const supabaseService = getSupabaseServiceClient();
  const { data: project, error } = await supabase
    .from("builder_projects")
    .select("id, name, sandbox_id")
    .eq("id", projectId)
    .single();
  if (error || !project) throw notFound("Project not found");
  const storedSandboxId = (project as Record<string, unknown>).sandbox_id as string | null;
  if (!storedSandboxId?.trim()) return { success: false, reason: "no_sandbox" };

  const projectName = (project as Record<string, unknown>).name as string ?? "project";
  const workdir = getProjectWorkdir(projectName);

  try {
    const { sandbox } = await getOrCreateBuilderSandbox(projectId, storedSandboxId);
    const workdirEntries = (await sandbox.files.list(workdir).catch(() => [])) as Array<{ name: string; type: string }>;
    const hasPackageJson = workdirEntries.some((e) => e.name === "package.json");
    const hasNextConfig = workdirEntries.some((e) => e.name === "next.config.ts" || e.name === "next.config.js");
    const hasSrcOrApp = workdirEntries.some((e) => e.name === "src" || e.name === "app");
    if (!hasPackageJson && !hasNextConfig && !hasSrcOrApp) return { success: false, reason: "no_project" };

    const snapshotFiles: SandboxFile[] = [];
    await listSandboxFilesRecurse(sandbox, workdir, "", snapshotFiles);
    let fileCount = snapshotFiles.filter((f) => !f.isFolder).length;
    if (fileCount === 0) {
      await new Promise((r) => setTimeout(r, 2000));
      snapshotFiles.length = 0;
      await listSandboxFilesRecurse(sandbox, workdir, "", snapshotFiles);
      fileCount = snapshotFiles.filter((f) => !f.isFolder).length;
    }
    if (fileCount === 0) return { success: false, reason: "no_files" };

    await persistFilesToDb(supabaseService, projectId, snapshotFiles);
    console.log("[builder] Sync from sandbox complete for project:", projectId, "files:", fileCount);
    return { success: true, fileCount };
  } catch (err) {
    console.error("[builder] Sync from sandbox failed:", err);
    return { success: false, reason: "no_files" };
  }
}

export async function getBuilderFileContent(
  accessToken: string,
  projectId: string,
  filePath: string
): Promise<string | null> {
  if (!projectId?.trim() || !filePath?.trim()) return null;
  const supabase = getSupabaseClientWithAuth(accessToken);
  const { data: project, error } = await supabase
    .from("builder_projects")
    .select("id")
    .eq("id", projectId)
    .single();
  if (error || !project) return null;
  const safePath = sanitizeRelativePath(filePath);
  const supabaseService = getSupabaseServiceClient();
  const { data } = await supabaseService
    .from("builder_sandbox_files")
    .select("content")
    .eq("project_id", projectId)
    .eq("path", safePath)
    .maybeSingle();
  return (data as { content: string } | null)?.content ?? null;
}

/**
 * Create a ZIP stream of the project files (from DB). Caller should pipe to response with appropriate headers.
 */
export async function exportProjectZipStream(
  accessToken: string,
  projectId: string
): Promise<{ stream: NodeJS.ReadableStream; projectName: string }> {
  const supabase = getSupabaseClientWithAuth(accessToken);
  const { data: project, error } = await supabase
    .from("builder_projects")
    .select("id, name")
    .eq("id", projectId)
    .single();
  if (error || !project) throw notFound("Project not found");
  const supabaseService = getSupabaseServiceClient();
  const files = await getProjectFilesFromDb(supabaseService, projectId);
  const archive = archiver("zip", { zlib: { level: 9 } });
  for (const f of files) {
    if (f.isFolder) continue;
    archive.append(Buffer.from(f.content ?? "", "utf8"), { name: f.path });
  }
  void archive.finalize();
  const projectName = (project.name as string) ?? "project";
  return { stream: archive, projectName };
}

const INVITE_TOKEN_BYTES = 24;

function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
}

export async function addCollaborator(
  accessToken: string,
  projectId: string,
  userId: string,
  params: { email: string; permission?: "view" | "edit" }
): Promise<{ inviteLink: string; projectName: string; inviterEmail?: string }> {
  const { email, permission = "view" } = params;
  const normalizedEmail = email?.trim()?.toLowerCase();
  if (!normalizedEmail) throw badRequest("Collaborator email is required");

  const supabase = getSupabaseClientWithAuth(accessToken);
  const { data: project, error: projectError } = await supabase
    .from("builder_projects")
    .select("id, name, owner_id")
    .eq("id", projectId)
    .eq("owner_id", userId)
    .single();
  if (projectError || !project) throw notFound("Project not found or you don't have permission");

  const token = generateInviteToken();
  const { error: insertError } = await supabase.from("builder_project_collaborators").insert({
    project_id: projectId,
    email: normalizedEmail,
    invited_by_user_id: userId,
    token,
    permission: permission === "edit" ? "edit" : "view",
  });
  if (insertError) {
    if (insertError.code === "23505") throw badRequest("This email is already invited to the project");
    throw new AppError(insertError.message, 500);
  }

  const env = await import("../config/env.js").then((m) => m.env);
  const frontendOrigin = env.frontendOrigin ?? "http://localhost:3000";
  const inviteLink = `${frontendOrigin}/builder/join?token=${encodeURIComponent(token)}`;

  let inviterEmail: string | undefined;
  try {
    const { getSessionUser } = await import("./auth.service.js");
    const session = await getSessionUser(accessToken);
    if (session.authenticated && session.user?.email) inviterEmail = session.user.email;
  } catch {
    // inviterEmail remains undefined; optional for invite link
  }

  return {
    inviteLink,
    projectName: (project as { name: string }).name,
    inviterEmail,
  };
}

export async function listCollaborators(
  accessToken: string,
  projectId: string
): Promise<{ collaborators: BuilderCollaboratorRow[] }> {
  const supabase = getSupabaseClientWithAuth(accessToken);
  const { data, error } = await supabase
    .from("builder_project_collaborators")
    .select("id, project_id, email, invited_by_user_id, permission, accepted_at, invited_user_id, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new AppError(error.message, 500);
  const collaborators: BuilderCollaboratorRow[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    projectId: row.project_id as string,
    email: row.email as string,
    invitedByUserId: row.invited_by_user_id as string,
    permission: (row.permission as "view" | "edit") ?? "view",
    acceptedAt: (row.accepted_at as string) ?? null,
    invitedUserId: (row.invited_user_id as string) ?? null,
    createdAt: row.created_at as string,
  }));
  return { collaborators };
}

export async function getInviteByToken(token: string): Promise<InviteInfo | null> {
  if (!token?.trim()) return null;
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("builder_project_collaborators")
    .select("project_id, email, accepted_at, invited_user_id")
    .eq("token", token.trim())
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  if (row.accepted_at) return null;
  const { data: project } = await supabase
    .from("builder_projects")
    .select("id, name")
    .eq("id", row.project_id)
    .single();
  if (!project) return null;
  return {
    projectId: (project as { id: string }).id,
    projectName: (project as { name: string }).name,
  };
}

export interface MarketplaceListingItem {
  id: string;
  name: string;
  description: string | null;
  framework: string;
  progressScore: number;
  founderName: string | null;
  whyBuilt: string | null;
  tractionSignals: Array<{ type: string; description: string; createdAt: string }>;
  valuationLow: number | null;
  valuationHigh: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceProjectDetail extends MarketplaceListingItem {
  valuationLow: number | null;
  valuationHigh: number | null;
  linkedAssets: Array<{ type: string; url: string; label?: string }>;
  recentActivity: Array<{ type: string; description: string; createdAt: string }>;
  ownerId: string;
}

export interface MarketplaceBidRow {
  id: string;
  project_id: string;
  bidder_id: string;
  bidder_email: string;
  amount_low: number;
  amount_high: number;
  message: string | null;
  transfer_type: "full" | "partial";
  status: string;
  created_at: string;
}

export async function getMarketplaceProjectById(projectId: string): Promise<MarketplaceProjectDetail | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("builder_projects")
    .select("id, name, description, framework, progress_score, founder_name, why_built, traction_signals, linked_assets, recent_activity, valuation_low, valuation_high, owner_id, created_at, updated_at")
    .eq("id", projectId)
    .eq("status", "listed")
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  const emptyTraction: Array<{ type: string; description: string; createdAt: string }> = [];
  const emptyAssets: Array<{ type: string; url: string; label?: string }> = [];
  const emptyActivity: Array<{ type: string; description: string; createdAt: string }> = [];
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    framework: (r.framework as string) ?? "nextjs",
    progressScore: typeof r.progress_score === "number" ? r.progress_score : 0,
    founderName: (r.founder_name as string) ?? null,
    whyBuilt: (r.why_built as string) ?? null,
    tractionSignals: parseJsonArray(r.traction_signals, emptyTraction),
    valuationLow: typeof r.valuation_low === "number" ? r.valuation_low : null,
    valuationHigh: typeof r.valuation_high === "number" ? r.valuation_high : null,
    linkedAssets: parseJsonArray(r.linked_assets, emptyAssets),
    recentActivity: parseJsonArray(r.recent_activity, emptyActivity),
    ownerId: r.owner_id as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function createMarketplaceBid(
  accessToken: string,
  projectId: string,
  params: { amountLow: number; amountHigh: number; message?: string; transferType: "full" | "partial" },
  bidderId: string,
  bidderEmail: string
): Promise<{ bid: { id: string; amountLow: number; amountHigh: number; transferType: string; createdAt: string } }> {
  const supabase = getSupabaseClientWithAuth(accessToken);
  const { data: project, error: projectError } = await supabase
    .from("builder_projects")
    .select("id, owner_id, status")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError || !project) throw notFound("Project not found");
  const p = project as Record<string, unknown>;
  if (p.owner_id === bidderId) throw badRequest("You cannot make an offer on your own project");
  if (p.status !== "listed") throw badRequest("Project is not listed for sale");
  if (params.amountLow < 0 || params.amountHigh < params.amountLow) throw badRequest("Invalid offer range");
  const { data: bid, error } = await supabase
    .from("marketplace_bids")
    .insert({
      project_id: projectId,
      bidder_id: bidderId,
      bidder_email: bidderEmail,
      amount_low: params.amountLow,
      amount_high: params.amountHigh,
      message: params.message ?? null,
      transfer_type: params.transferType,
      status: "active",
    })
    .select("id, amount_low, amount_high, transfer_type, created_at")
    .single();
  if (error) throw dbError("Failed to submit offer. Please try again.");
  const b = bid as Record<string, unknown>;
  return {
    bid: {
      id: b.id as string,
      amountLow: b.amount_low as number,
      amountHigh: b.amount_high as number,
      transferType: b.transfer_type as string,
      createdAt: b.created_at as string,
    },
  };
}

export async function listMarketplaceBids(
  projectId: string,
  accessToken: string | undefined,
  userId: string | undefined
): Promise<{ bids: Array<{ id: string; bidderEmail: string; amountLow: number; amountHigh: number; message: string | null; transferType: string; status: string; createdAt: string }>; count: number }> {
  const supabaseService = getSupabaseServiceClient();
  const { count: totalCount, error: countError } = await supabaseService
    .from("marketplace_bids")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .in("status", ["active", "accepted"]);
  const count = countError ? 0 : (totalCount ?? 0);
  if (!accessToken || !userId) {
    return { bids: [], count };
  }
  const supabase = getSupabaseClientWithAuth(accessToken);
  const { data: project } = await supabase
    .from("builder_projects")
    .select("owner_id")
    .eq("id", projectId)
    .maybeSingle();
  const isOwner = project && (project as Record<string, unknown>).owner_id === userId;
  if (!isOwner) {
    return { bids: [], count };
  }
  const { data: bids, error } = await supabase
    .from("marketplace_bids")
    .select("id, bidder_email, amount_low, amount_high, message, transfer_type, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) return { bids: [], count };
  const list = (bids ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      bidderEmail: r.bidder_email as string,
      amountLow: r.amount_low as number,
      amountHigh: r.amount_high as number,
      message: (r.message as string) ?? null,
      transferType: r.transfer_type as string,
      status: r.status as string,
      createdAt: r.created_at as string,
    };
  });
  return { bids: list, count };
}

export async function acceptMarketplaceBid(accessToken: string, bidId: string): Promise<{ ok: boolean; transferType?: string; error?: string }> {
  const supabase = getSupabaseClientWithAuth(accessToken);
  const { data: result, error } = await supabase.rpc("accept_marketplace_bid", { p_bid_id: bidId });
  if (error) {
    const msg = (error as { message?: string }).message ?? "Failed to accept offer";
    return { ok: false, error: msg };
  }
  const obj = (result as { ok?: boolean; error?: string; transfer_type?: string }) ?? {};
  if (!obj.ok) return { ok: false, error: obj.error ?? "Could not accept offer" };
  return { ok: true, transferType: obj.transfer_type };
}

export async function listMarketplaceProjects(): Promise<{ listings: MarketplaceListingItem[] }> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("builder_projects")
    .select("id, name, description, framework, progress_score, founder_name, why_built, traction_signals, valuation_low, valuation_high, created_at, updated_at")
    .eq("status", "listed")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) throw dbError("Failed to load marketplace listings. Please try again.");

  const emptyTraction: Array<{ type: string; description: string; createdAt: string }> = [];
  const listings: MarketplaceListingItem[] = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      framework: (r.framework as string) ?? "nextjs",
      progressScore: typeof r.progress_score === "number" ? r.progress_score : 0,
      founderName: (r.founder_name as string) ?? null,
      whyBuilt: (r.why_built as string) ?? null,
      tractionSignals: parseJsonArray(r.traction_signals, emptyTraction),
      valuationLow: typeof r.valuation_low === "number" ? r.valuation_low : null,
      valuationHigh: typeof r.valuation_high === "number" ? r.valuation_high : null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  });

  return { listings };
}

export async function listProjectForSale(accessToken: string, projectId: string): Promise<{ success: boolean }> {
  const supabase = getSupabaseClientWithAuth(accessToken);
  const { error } = await supabase
    .from("builder_projects")
    .update({ status: "listed", updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) throw dbError("Failed to list project. Please try again.");
  return { success: true };
}

export async function acceptInvite(accessToken: string, token: string, userId: string): Promise<{ projectId: string }> {
  if (!token?.trim()) throw badRequest("Invite token is required");
  const supabaseService = getSupabaseServiceClient();
  const { data: row, error: findError } = await supabaseService
    .from("builder_project_collaborators")
    .select("id, project_id, email, accepted_at, invited_user_id")
    .eq("token", token.trim())
    .maybeSingle();
  if (findError || !row) throw notFound("Invite not found or expired");
  const r = row as Record<string, unknown>;
  if (r.accepted_at) throw badRequest("This invite has already been accepted");
  const { getSessionUser } = await import("./auth.service.js");
  const session = await getSessionUser(accessToken);
  const currentEmail = session.authenticated && session.user?.email ? session.user.email.toLowerCase() : "";
  const inviteEmail = (r.email as string).toLowerCase();
  if (currentEmail && currentEmail !== inviteEmail)
    throw badRequest("This invite was sent to a different email. Sign in with that email to accept.");
  const { error: updateError } = await supabaseService
    .from("builder_project_collaborators")
    .update({ invited_user_id: userId, accepted_at: new Date().toISOString() })
    .eq("id", r.id);
  if (updateError) throw new AppError(updateError.message, 500);
  return { projectId: r.project_id as string };
}

const LOGO_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const LOGO_ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

function isStorageLogoPath(logoUrl: string | null): boolean {
  if (!logoUrl || typeof logoUrl !== "string") return false;
  const t = logoUrl.trim();
  return t.length > 0 && !t.startsWith("http://") && !t.startsWith("https://");
}

/** Resolve logo_url to a signed URL when it's a storage path (private bucket). */
async function resolveLogoUrl(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl || !isStorageLogoPath(logoUrl)) return logoUrl;
  const bucket = env.supabaseLogoBucket;
  if (!bucket) return logoUrl;
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(logoUrl, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/** Write project logo as Next.js app icon (src/app/icon.png). Next.js 13+ uses this for the tab icon. */
async function writeProjectLogoAsAppIcon(
  sandbox: Sandbox,
  workdir: string,
  logoUrl: string
): Promise<void> {
  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > 2 * 1024 * 1024) return; // cap 2MB
    const iconPath = `${workdir}/src/app/icon.png`;
    await sandbox.commands.run(`mkdir -p ${workdir}/src/app`, { timeoutMs: 5000, cwd: "/home/user" }).catch(() => {});
    await sandbox.files.write([{ path: iconPath, data: buf }]);
  } catch {
    // Non-blocking: logo in app is nice-to-have
  }
}

/** Try OpenAI DALL-E 2 for logo image. Returns buffer + contentType or null if unavailable. */
async function generateProjectLogoWithOpenAI(
  projectName: string,
  userPrompt?: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const apiKey = env.openaiApiKey;
  if (!apiKey?.trim()) return null;

  const basePrompt = userPrompt?.trim()
    ? userPrompt.trim()
    : `minimal flat vector app logo icon for "${projectName}", clean design, solid background, professional`;
  const prompt = `${basePrompt}, square format, no text, digital art, 256x256`;

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "dall-e-2",
      prompt,
      n: 1,
      size: "256x256",
      response_format: "b64_json",
    }),
    signal: AbortSignal.timeout(30000),
  }).catch((err) => {
    console.warn("[builder] DALL-E logo request failed:", err?.message ?? err);
    return null;
  });

  if (!res?.ok) return null;
  const data = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64 || typeof b64 !== "string") return null;
  const buffer = Buffer.from(b64, "base64");
  return { buffer, contentType: "image/png" };
}

export async function generateProjectLogo(
  projectName: string,
  userPrompt?: string
): Promise<{ logoUrl: string }> {
  const basePrompt = userPrompt?.trim()
    ? `${userPrompt.trim()}, square format, no text, digital art, 256x256`
    : `minimal flat vector app logo icon for "${projectName}", clean design, solid background, professional, square format, no text, 256x256`;

  const encoded = encodeURIComponent(basePrompt);

  const logoUrl = `https://image.pollinations.ai/prompt/${encoded}?width=256&height=256&nologo=true&seed=${Date.now() % 99999}`;
  return { logoUrl };
}

const IMAGE_GEN_MAX_BYTES = 4 * 1024 * 1024; // 4MB for website images

/**
 * Generate an image for use in a builder project (e.g. hero, illustration). Used by the agent via GENERATE_IMAGE.
 * Uploads to Supabase storage under projects/{projectId}/generated/{filename}. Returns public/signed URL.
 */
export async function generateImageForProject(
  _accessToken: string,
  projectId: string,
  params: { prompt: string; suggestedFilename?: string }
): Promise<{ url: string }> {
  const { prompt, suggestedFilename } = params;
  if (!prompt?.trim()) throw badRequest("Image prompt is required");
  const bucket = env.supabaseLogoBucket;
  if (!bucket) throw badRequest("Image generation requires Supabase storage (SUPABASE_STORAGE_BUCKET or SUPABASE_LOGO_BUCKET)");

  const fullPrompt = `${prompt.trim()}, high quality, web suitable, no text overlay`;
  const encoded = encodeURIComponent(fullPrompt);
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=576&nologo=true&seed=${Date.now() % 99999}`;

  const response = await fetch(pollinationsUrl, {
    method: "GET",
    headers: { "User-Agent": "CodeEasyBuilder/1.0 (https://codeeasy.app)" },
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);

  if (!response?.ok) {
    throw new AppError("Image generation request failed. Try again or use a different description.", 502, "IMAGE_GEN_FAILED");
  }
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!LOGO_ALLOWED_MIME_TYPES.has(contentType)) {
    throw new AppError("Image generation returned an unsupported format.", 502, "IMAGE_GEN_FAILED");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > IMAGE_GEN_MAX_BYTES) {
    throw new AppError("Generated image too large.", 502, "IMAGE_GEN_FAILED");
  }

  const ext = contentType === "image/png" ? "png" : "jpg";
  const safeName = (suggestedFilename ?? "image").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 60) || "image";
  const storagePath = `projects/${projectId}/generated/${safeName}.${ext}`;
  const supabase = getSupabaseServiceClient();
  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType,
    upsert: true,
  });
  if (uploadError) {
    console.error("[builder] generateImageForProject upload error:", uploadError);
    throw new AppError("Failed to save generated image.", 500, "IMAGE_GEN_FAILED");
  }
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return { url: urlData.publicUrl };
}

/**
 * Get logo image for preview: returns base64 when we can (DALL-E or successful fetch), else Pollinations URL.
 * Callers can display data URL when logoImageBase64 is set, avoiding Pollinations 1033 in the browser.
 */
export async function getLogoPreviewImage(
  projectName: string,
  userPrompt?: string
): Promise<{ logoImageBase64?: string; contentType?: string; logoUrl: string }> {
  const promptForImage = userPrompt?.trim()
    ? `${userPrompt.trim()}, square format, no text, digital art, 256x256, app logo`
    : `minimal flat vector app logo for "${projectName}", clean design, professional, square, no text, 256x256`;

  const openAIResult = await generateProjectLogoWithOpenAI(projectName.trim(), userPrompt?.trim());
  if (openAIResult) {
    const { buffer, contentType } = openAIResult;
    if (LOGO_ALLOWED_MIME_TYPES.has(contentType) && buffer.length <= LOGO_MAX_BYTES) {
      return {
        logoImageBase64: buffer.toString("base64"),
        contentType,
        logoUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(promptForImage)}?width=256&height=256&nologo=true&seed=0`,
      };
    }
  }

  const { logoUrl } = await generateProjectLogo(projectName.trim(), userPrompt?.trim());
  const response = await fetch(logoUrl, {
    method: "GET",
    headers: { "User-Agent": "CodeEasyBuilder/1.0 (https://codeeasy.app)" },
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);

  if (response?.ok) {
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (LOGO_ALLOWED_MIME_TYPES.has(contentType)) {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length <= LOGO_MAX_BYTES) {
        return {
          logoImageBase64: buffer.toString("base64"),
          contentType,
          logoUrl,
        };
      }
    }
  }

  return { logoUrl };
}

/**
 * Generate logo image, upload (if bucket configured), update project logo_url.
 */
export async function uploadProjectLogoToStorage(
  accessToken: string,
  projectId: string,
  params: { logoPrompt?: string; projectName: string }
): Promise<{ logoUrl: string | null }> {
  const bucket = env.supabaseLogoBucket;
  const { logoPrompt, projectName } = params;
  if (!projectName?.trim()) throw badRequest("projectName is required");

  const preview = await getLogoPreviewImage(projectName.trim(), logoPrompt?.trim());
  if (preview.logoImageBase64 && preview.contentType && bucket) {
    const buffer = Buffer.from(preview.logoImageBase64, "base64");
    if (LOGO_ALLOWED_MIME_TYPES.has(preview.contentType) && buffer.length <= LOGO_MAX_BYTES) {
      const ext = preview.contentType === "image/png" ? "png" : "jpg";
      const storagePath = `projects/${projectId}.${ext}`;
      const supabase = getSupabaseServiceClient();
      const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
        contentType: preview.contentType,
        upsert: true,
      });
      if (!uploadError) {
        const supabaseAuth = getSupabaseClientWithAuth(accessToken);
        const { error: updateError } = await supabaseAuth
          .from("builder_projects")
          .update({ logo_url: storagePath, updated_at: new Date().toISOString() })
          .eq("id", projectId);
        if (!updateError) return { logoUrl: storagePath };
      }
    }
  }

  const openAIResult = await generateProjectLogoWithOpenAI(projectName.trim(), logoPrompt?.trim());
  if (openAIResult && bucket) {
    const { buffer, contentType } = openAIResult;
    if (!LOGO_ALLOWED_MIME_TYPES.has(contentType) || buffer.length > LOGO_MAX_BYTES) {
      const supabase = getSupabaseClientWithAuth(accessToken);
      const { logoUrl: fallbackUrl } = await generateProjectLogo(projectName.trim(), logoPrompt?.trim());
      const { error: updateError } = await supabase
        .from("builder_projects")
        .update({ logo_url: fallbackUrl, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      if (updateError) throw dbError("Failed to update project logo");
      return { logoUrl: fallbackUrl };
    }
    const ext = contentType === "image/png" ? "png" : "jpg";
    const storagePath = `projects/${projectId}.${ext}`;
    const supabase = getSupabaseServiceClient();
    const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });
    if (uploadError) {
      console.warn("[builder] DALL-E logo upload failed, saving Pollinations URL:", uploadError.message);
      const { logoUrl: fallbackUrl } = await generateProjectLogo(projectName.trim(), logoPrompt?.trim());
      const supabaseAuth = getSupabaseClientWithAuth(accessToken);
      await supabaseAuth
        .from("builder_projects")
        .update({ logo_url: fallbackUrl, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      return { logoUrl: fallbackUrl };
    }
    const supabaseAuth = getSupabaseClientWithAuth(accessToken);
    const { error: updateError } = await supabaseAuth
      .from("builder_projects")
      .update({ logo_url: storagePath, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    if (updateError) throw dbError("Failed to update project logo");
    return { logoUrl: storagePath };
  }

  const { logoUrl: imageUrl } = await generateProjectLogo(projectName.trim(), logoPrompt?.trim());

  const response = await fetch(imageUrl, {
    method: "GET",
    headers: { "User-Agent": "CodeEasyBuilder/1.0 (https://codeeasy.app)" },
    signal: AbortSignal.timeout(15000),
  }).catch((err) => {
    console.warn("[builder] logo image fetch failed:", err?.message ?? err);
    return null;
  });

  if (!response?.ok) {
    const status = response?.status ?? "network_error";
    console.warn("[builder] logo image fetch not ok, saving Pollinations URL as fallback:", status);
    const supabase = getSupabaseClientWithAuth(accessToken);
    const { error: updateError } = await supabase
      .from("builder_projects")
      .update({ logo_url: imageUrl, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    if (updateError) throw dbError("Failed to update project logo");
    return { logoUrl: imageUrl };
  }

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!LOGO_ALLOWED_MIME_TYPES.has(contentType)) {
    const supabase = getSupabaseClientWithAuth(accessToken);
    const { error: updateError } = await supabase
      .from("builder_projects")
      .update({ logo_url: imageUrl, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    if (updateError) throw dbError("Failed to update project logo");
    return { logoUrl: imageUrl };
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > LOGO_MAX_BYTES) {
    const supabase = getSupabaseClientWithAuth(accessToken);
    const { error: updateError } = await supabase
      .from("builder_projects")
      .update({ logo_url: imageUrl, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    if (updateError) throw dbError("Failed to update project logo");
    return { logoUrl: imageUrl };
  }

  const ext = contentType === "image/png" ? "png" : "jpg";
  const storagePath = `projects/${projectId}.${ext}`;

  if (bucket) {
    const supabase = getSupabaseServiceClient();
    const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });
    if (uploadError) {
      console.error("[builder] logo upload error:", uploadError);
      const supabaseAuth = getSupabaseClientWithAuth(accessToken);
      const { error: updateError } = await supabaseAuth
        .from("builder_projects")
        .update({ logo_url: imageUrl, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      if (updateError) throw dbError("Failed to update project logo");
      return { logoUrl: imageUrl };
    }
    const supabaseAuth = getSupabaseClientWithAuth(accessToken);
    const { error: updateError } = await supabaseAuth
      .from("builder_projects")
      .update({ logo_url: storagePath, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    if (updateError) throw dbError("Failed to update project logo");
    return { logoUrl: storagePath };
  }

  const supabase = getSupabaseClientWithAuth(accessToken);
  const { error: updateError } = await supabase
    .from("builder_projects")
    .update({ logo_url: imageUrl, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (updateError) throw dbError("Failed to update project logo");
  return { logoUrl: imageUrl };
}

/**
 * Upload a logo image from base64 (no project required). Returns the storage path to use as logoUrl when creating a project.
 * Requires Storage bucket. Enforces 5MB and image/jpeg, image/jpg, image/png.
 */
export async function uploadLogoImage(
  _accessToken: string,
  params: { base64: string; contentType: string }
): Promise<{ logoUrl: string }> {
  const bucket = env.supabaseLogoBucket;
  if (!bucket) {
    throw badRequest(
      "Logo upload requires SUPABASE_STORAGE_BUCKET (or SUPABASE_LOGO_BUCKET) to be set in .env to your Supabase Storage bucket name. Create a bucket in Supabase Dashboard → Storage if needed."
    );
  }
  const { base64, contentType } = params;
  const normalizedType = contentType.split(";")[0].trim().toLowerCase();
  if (!LOGO_ALLOWED_MIME_TYPES.has(normalizedType)) {
    throw badRequest("Logo must be image/jpeg, image/jpg, or image/png");
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    throw badRequest("Invalid logo file data");
  }
  if (buffer.length > LOGO_MAX_BYTES) throw badRequest("Logo file size must not exceed 5MB");

  const ext = normalizedType === "image/png" ? "png" : "jpg";
  const id = randomBytes(12).toString("hex");
  const storagePath = `projects/logos/${id}.${ext}`;
  const supabase = getSupabaseServiceClient();
  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: normalizedType,
    upsert: false,
  });
  if (uploadError) {
    console.error("[builder] uploadLogoImage error:", uploadError);
    throw new AppError("Failed to upload logo", 500);
  }
  return { logoUrl: storagePath };
}

/**
 * Upload a logo from base64 for an existing project (updates project logo_url). Requires Storage bucket.
 */
export async function uploadProjectLogoFromBuffer(
  accessToken: string,
  projectId: string,
  params: { base64: string; contentType: string }
): Promise<{ logoUrl: string | null }> {
  const bucket = env.supabaseLogoBucket;
  if (!bucket) throw badRequest("Logo upload from file requires storage to be configured");
  const { base64, contentType } = params;
  const normalizedType = contentType.split(";")[0].trim().toLowerCase();
  if (!LOGO_ALLOWED_MIME_TYPES.has(normalizedType)) {
    throw badRequest("Logo must be image/jpeg, image/jpg, or image/png");
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    throw badRequest("Invalid logo file data");
  }
  if (buffer.length > LOGO_MAX_BYTES) throw badRequest("Logo file size must not exceed 5MB");

  const ext = normalizedType === "image/png" ? "png" : "jpg";
  const storagePath = `projects/${projectId}.${ext}`;
  const supabase = getSupabaseServiceClient();
  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: normalizedType,
    upsert: true,
  });
  if (uploadError) {
    console.error("[builder] logo upload from buffer error:", uploadError);
    throw new AppError("Failed to upload logo", 500);
  }
  const supabaseAuth = getSupabaseClientWithAuth(accessToken);
  const { error: updateError } = await supabaseAuth
    .from("builder_projects")
    .update({ logo_url: storagePath, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (updateError) throw dbError("Failed to update project logo");
  return { logoUrl: storagePath };
}

interface GitHubApiRepoResponse {
  html_url?: string;
  full_name?: string;
  clone_url?: string;
  message?: string;
}

async function getOrResumeSandbox(accessToken: string, projectId: string): Promise<{ sandbox: Awaited<ReturnType<typeof getOrCreateBuilderSandbox>>["sandbox"]; workdir: string }> {
  const supabase = getSupabaseClientWithAuth(accessToken);
  const supabaseService = getSupabaseServiceClient();
  const { data: project, error } = await supabase
    .from("builder_projects")
    .select("id, sandbox_id, name")
    .eq("id", projectId)
    .single();
  if (error || !project) throw notFound("Project not found");

  const projectName = (project as Record<string, unknown>).name as string ?? "project";
  const workdir = getProjectWorkdir(projectName);
  const storedSandboxId = (project as Record<string, unknown>).sandbox_id as string | null;
  const { sandbox, sandboxId, isNew } = await getOrCreateBuilderSandbox(projectId, storedSandboxId);

  if (isNew) {
    const files = await getProjectFilesFromDb(supabaseService, projectId);
    if (files.length > 0) {
      await restoreFilesToSandbox(sandbox, files, workdir);
      await sandbox.commands.run("pnpm install", {
        cwd: workdir,
        timeoutMs: 5 * 60 * 1000,
      });
    }
    if (sandboxId !== storedSandboxId) {
      await supabase
        .from("builder_projects")
        .update({ sandbox_id: sandboxId })
        .eq("id", projectId);
    }
  }
  return { sandbox, workdir };
}

export async function connectGitHub(
  accessToken: string,
  projectId: string,
  githubToken: string,
  repoName: string
): Promise<{ repoUrl: string; repoOwner: string; repoName: string }> {
  if (!githubToken?.trim()) throw badRequest("GitHub token is required");
  if (!repoName?.trim()) throw badRequest("Repository name is required");

  const { sandbox, workdir } = await getOrResumeSandbox(accessToken, projectId);

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!userResponse.ok) throw badRequest("Invalid GitHub token or insufficient permissions");
  const githubUser = (await userResponse.json()) as { login?: string };
  const owner = githubUser.login ?? "";
  if (!owner) throw badRequest("Could not determine GitHub username");

  const createResponse = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ name: repoName.trim(), private: true, auto_init: false, description: "Created by Code Easy Builder" }),
  });
  const repoData = (await createResponse.json()) as GitHubApiRepoResponse;
  if (!createResponse.ok && createResponse.status !== 422) {
    throw badRequest(repoData.message ?? "Failed to create GitHub repository");
  }

  const repoUrl = repoData.html_url ?? `https://github.com/${owner}/${repoName.trim()}`;
  const tokenizedRemote = `https://${githubToken}@github.com/${owner}/${repoName.trim()}.git`;

  const gitCommands = [
    `git -C ${workdir} init -b main 2>/dev/null || true`,
    `git -C ${workdir} config user.email "builder@codeeasy.app"`,
    `git -C ${workdir} config user.name "Code Easy Builder"`,
    `git -C ${workdir} remote remove origin 2>/dev/null || true`,
    `git -C ${workdir} remote add origin ${tokenizedRemote}`,
    `git -C ${workdir} add -A`,
    `git -C ${workdir} commit -m "Initial commit from Code Easy Builder" --allow-empty`,
    `git -C ${workdir} push -u origin main --force`,
  ];
  for (const cmd of gitCommands) {
    await sandbox.commands.run(cmd, { timeoutMs: 60000 });
  }

  return { repoUrl, repoOwner: owner, repoName: repoName.trim() };
}

export async function syncToGitHub(
  accessToken: string,
  projectId: string,
  githubToken: string
): Promise<{ message: string }> {
  if (!githubToken?.trim()) throw badRequest("GitHub token is required");

  const { sandbox, workdir } = await getOrResumeSandbox(accessToken, projectId);

  const statusResult = await sandbox.commands.run(
    `git -C ${workdir} status --porcelain`,
    { timeoutMs: 10000 }
  );
  if (!statusResult.stdout?.trim()) {
    return { message: "Nothing to commit — everything is up to date" };
  }

  const timestamp = new Date().toISOString();
  await sandbox.commands.run(`git -C ${workdir} add -A`, { timeoutMs: 10000 });
  await sandbox.commands.run(`git -C ${workdir} commit -m "Auto-sync ${timestamp}"`, { timeoutMs: 10000 });
  await sandbox.commands.run(`git -C ${workdir} push origin main`, { timeoutMs: 60000 });

  return { message: "Changes pushed successfully" };
}

interface VercelFile {
  file: string;
  data: string;
  encoding: "utf-8" | "base64";
}

interface VercelDeploymentResponse {
  url?: string;
  id?: string;
  error?: { message?: string };
  message?: string;
}

export async function publishToVercel(
  accessToken: string,
  projectId: string,
  vercelToken: string
): Promise<{ deploymentUrl: string }> {
  if (!vercelToken?.trim()) throw badRequest("Vercel token is required");

  const supabase = getSupabaseClientWithAuth(accessToken);
  const { data: project, error } = await supabase
    .from("builder_projects")
    .select("id, framework")
    .eq("id", projectId)
    .single();
  if (error || !project) throw notFound("Project not found");

  const supabaseService = getSupabaseServiceClient();
  const dbFiles = await getProjectFilesFromDb(supabaseService, projectId);
  if (dbFiles.length === 0) throw badRequest("Project has no files. Try scaffolding first.");

  const SKIP_DEPLOY_DIRS = new Set(["node_modules", ".next", "dist", ".turbo", ".git", "out"]);
  const fileEntries: VercelFile[] = dbFiles
    .filter((f) => {
      if (f.isFolder) return false;
      const parts = f.path.split("/");
      return !parts.some((p) => SKIP_DEPLOY_DIRS.has(p));
    })
    .map((f) => ({
      file: f.path,
      data: Buffer.from(f.content).toString("base64"),
      encoding: "base64" as const,
    }));

  const projectName = `codeeasy-${projectId.slice(0, 8)}`;
  const framework = (project as Record<string, unknown>).framework as string ?? "nextjs";

  const deployResponse = await fetch("https://api.vercel.com/v13/deployments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: projectName,
      files: fileEntries,
      projectSettings: { framework, buildCommand: null, outputDirectory: null },
      target: "production",
    }),
  });

  const deployData = (await deployResponse.json()) as VercelDeploymentResponse;
  if (!deployResponse.ok) {
    throw badRequest(deployData.error?.message ?? deployData.message ?? "Deployment failed");
  }

  const deploymentUrl = deployData.url ? `https://${deployData.url}` : "";
  return { deploymentUrl };
}
