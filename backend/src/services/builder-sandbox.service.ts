/**
 * Builder sandbox helpers — E2B sandbox lifecycle and file persistence.
 *
 * Architecture:
 *  - builder_sandbox_files (Supabase) = persistent source of truth for all project files.
 *  - E2B sandbox = ephemeral execution environment (dev server, install commands, git).
 *  - On every file write: write to sandbox filesystem + upsert to DB.
 *  - On sandbox resume/recreate: restore files from DB → npm install → ready.
 */
import { Sandbox } from "e2b";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { BUILDER_SEED_PATH } from "../e2b-templates/nextjs-builder.js";

/** Base dir for all projects: /home/user/project. Each project uses a subdir project/{name}/frontend. */
export const BUILDER_SANDBOX_PROJECTS_BASE = "/home/user/project";

/** @deprecated Use getProjectWorkdir(projectName) so multiple projects don't conflict. */
export const BUILDER_SANDBOX_WORKDIR = "/home/user/project";

const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

/**
 * Sanitize project name for use as a path segment (safe for fs, no spaces/special).
 */
export function sanitizeProjectName(name: string): string {
  const trimmed = (name ?? "project").trim() || "project";
  const safe = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe.slice(0, 50) || "project";
}

/**
 * Workdir for a project: /home/user/project/{projectName}/frontend.
 * Use this so one sandbox can hold multiple projects and we can add e.g. backend later.
 */
export function getProjectWorkdir(projectName: string): string {
  const segment = sanitizeProjectName(projectName);
  return `${BUILDER_SANDBOX_PROJECTS_BASE}/${segment}/frontend`;
}

const SKIP_SNAPSHOT_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  ".turbo",
  ".git",
  "out",
  ".cache",
  ".pnpm-store",
]);

interface BuilderSandboxEntry {
  sandboxId: string;
  sandbox: Sandbox;
}

const sandboxCache = new Map<string, BuilderSandboxEntry>();

export interface SandboxFile {
  path: string;
  content: string;
  isFolder: boolean;
}

interface E2BFileEntry {
  name: string;
  type: "file" | "dir";
  path: string;
}

function requireE2B(): void {
  if (!env.e2bApiKey) {
    console.error("[builder] E2B_API_KEY is not set. Add it to backend .env (get a key at e2b.dev).");
    throw new Error("E2B_API_KEY is required for builder sandbox operations");
  }
}

/**
 * Sandboxes are isolated per project: each builder_projects row has its own
 * sandbox_id. No two projects share a sandbox; connect(resume) uses the stored
 * sandbox_id so the same project always uses the same sandbox.
 */
/**
 * Get a running sandbox from the in-memory cache, attempt to reconnect to a
 * stored sandbox ID, or spin up a brand-new one.
 * Returns isNew=true when a fresh sandbox was created so callers know to
 * restore files and run install before starting the dev server.
 * Connect() automatically resumes a paused sandbox.
 */
export async function getOrCreateBuilderSandbox(
  projectId: string,
  storedSandboxId?: string | null
): Promise<{ sandbox: Sandbox; sandboxId: string; isNew: boolean }> {
  requireE2B();

  const cached = sandboxCache.get(projectId);
  if (cached) {
    const isRunning = await cached.sandbox.isRunning().catch(() => false);
    if (isRunning) {
      await cached.sandbox.setTimeout(SANDBOX_TIMEOUT_MS).catch(() => {});
      return { sandbox: cached.sandbox, sandboxId: cached.sandboxId, isNew: false };
    }
    sandboxCache.delete(projectId);
  }

  if (storedSandboxId) {
    try {
      const sandbox = await Sandbox.connect(storedSandboxId, { apiKey: env.e2bApiKey });
      const isRunning = await sandbox.isRunning().catch(() => false);
      if (isRunning) {
        await sandbox.setTimeout(SANDBOX_TIMEOUT_MS).catch(() => {});
        sandboxCache.set(projectId, { sandboxId: storedSandboxId, sandbox });
        return { sandbox, sandboxId: storedSandboxId, isNew: false };
      }
    } catch {
      // Sandbox expired or not found — fall through to create a new one
    }
  }

  const templateName = env.e2bBuilderTemplateName;
  const sandbox = templateName
    ? await Sandbox.create(templateName, {
        apiKey: env.e2bApiKey,
        timeoutMs: SANDBOX_TIMEOUT_MS,
      })
    : await Sandbox.create({
        apiKey: env.e2bApiKey,
        timeoutMs: SANDBOX_TIMEOUT_MS,
      });
  const sandboxId = sandbox.sandboxId;
  sandboxCache.set(projectId, { sandboxId, sandbox });
  return { sandbox, sandboxId, isNew: true };
}

/** Path to the pre-baked Next.js seed in the builder template (when E2B_BUILDER_TEMPLATE_NAME is set). */
export { BUILDER_SEED_PATH };

/**
 * Pause a project's sandbox (E2B beta). Saves state; resume automatically on next connect.
 * Call when user leaves the build page or after inactivity to reduce cost.
 */
export async function pauseBuilderSandbox(sandboxId: string): Promise<boolean> {
  requireE2B();
  try {
    const sandbox = await Sandbox.connect(sandboxId, { apiKey: env.e2bApiKey });
    return await sandbox.betaPause();
  } catch {
    return false;
  }
}

/** Kill a project's sandbox and remove from cache. */
export async function killBuilderSandbox(
  projectId: string,
  storedSandboxId?: string | null
): Promise<void> {
  const cached = sandboxCache.get(projectId);
  if (cached) {
    await cached.sandbox.kill().catch(() => {});
    sandboxCache.delete(projectId);
    return;
  }
  if (storedSandboxId) {
    try {
      const sandbox = await Sandbox.connect(storedSandboxId, { apiKey: env.e2bApiKey });
      await sandbox.kill().catch(() => {});
    } catch {
      // Already gone
    }
  }
}

/**
 * Remove cache entry for a sandbox by its E2B sandbox ID (e.g. when webhook reports sandbox killed).
 * Call this when you receive sandbox.lifecycle.killed so next use creates a fresh sandbox.
 */
export function clearCacheBySandboxId(sandboxId: string): void {
  for (const [projectId, entry] of sandboxCache.entries()) {
    if (entry.sandboxId === sandboxId) {
      sandboxCache.delete(projectId);
      return;
    }
  }
}

/** Write a batch of files from DB records into the sandbox filesystem. */
export async function restoreFilesToSandbox(
  sandbox: Sandbox,
  files: SandboxFile[],
  workdir: string = BUILDER_SANDBOX_WORKDIR
): Promise<void> {
  const base = workdir.replace(/\/+$/, "");
  const writeEntries = files
    .filter((f) => !f.isFolder)
    .map((f) => ({
      path: `${base}/${f.path.replace(/^\/+/, "")}`,
      data: f.content,
    }));

  if (writeEntries.length === 0) return;

  const BATCH_SIZE = 50;
  for (let i = 0; i < writeEntries.length; i += BATCH_SIZE) {
    await sandbox.files.write(writeEntries.slice(i, i + BATCH_SIZE));
  }
}

/** Recursively list files from a sandbox directory, skipping build artefacts. */
export async function listSandboxFilesRecurse(
  sandbox: Sandbox,
  dirPath: string,
  relBase: string,
  results: SandboxFile[]
): Promise<void> {
  const entries = (await sandbox.files.list(dirPath).catch(() => [])) as E2BFileEntry[];
  for (const entry of entries) {
    const { name } = entry;
    if (SKIP_SNAPSHOT_DIRS.has(name)) continue;
    const relPath = relBase ? `${relBase}/${name}` : name;
    const fullPath = `${dirPath}/${name}`;
    const type = entry.type as string;
    const isDir = type === "dir" || type === "directory";
    if (isDir) {
      results.push({ path: relPath, content: "", isFolder: true });
      await listSandboxFilesRecurse(sandbox, fullPath, relPath, results);
    } else {
      const raw = await sandbox.files.read(fullPath).catch(() => "") as string | Buffer | unknown;
      const content =
        typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString("utf-8") : String(raw ?? "");
      results.push({ path: relPath, content, isFolder: false });
    }
  }
}

/** Upsert a batch of files into the builder_sandbox_files table. */
export async function persistFilesToDb(
  supabase: SupabaseClient,
  projectId: string,
  files: SandboxFile[]
): Promise<void> {
  if (files.length === 0) return;

  const now = new Date().toISOString();
  const rows = files.map((f) => ({
    project_id: projectId,
    path: f.path,
    content: f.content,
    is_folder: f.isFolder,
    updated_at: now,
  }));

  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await supabase
      .from("builder_sandbox_files")
      .upsert(rows.slice(i, i + BATCH_SIZE), { onConflict: "project_id,path" });
  }
}

/** Remove a single file from the persistent DB record. */
export async function deleteFileFromDb(
  supabase: SupabaseClient,
  projectId: string,
  filePath: string
): Promise<void> {
  await supabase
    .from("builder_sandbox_files")
    .delete()
    .eq("project_id", projectId)
    .eq("path", filePath);
}

/** Delete all file records for a project (called on project delete). */
export async function deleteAllProjectFilesFromDb(
  supabase: SupabaseClient,
  projectId: string
): Promise<void> {
  await supabase.from("builder_sandbox_files").delete().eq("project_id", projectId);
}

/** Fetch all persisted files for a project (used on sandbox restore and file listing). */
export async function getProjectFilesFromDb(
  supabase: SupabaseClient,
  projectId: string
): Promise<SandboxFile[]> {
  const { data } = await supabase
    .from("builder_sandbox_files")
    .select("path, content, is_folder")
    .eq("project_id", projectId)
    .order("path", { ascending: true });

  if (!data) return [];
  return (data as Array<{ path: string; content: string; is_folder: boolean }>).map((row) => ({
    path: row.path,
    content: row.content,
    isFolder: row.is_folder,
  }));
}
