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

export const BUILDER_SANDBOX_WORKDIR = "/home/user/project";

const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

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
    throw new Error("E2B_API_KEY is required for builder sandbox operations");
  }
}

/**
 * Get a running sandbox from the in-memory cache, attempt to reconnect to a
 * stored sandbox ID, or spin up a brand-new one.
 * Returns isNew=true when a fresh sandbox was created so callers know to
 * restore files and run install before starting the dev server.
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

  const sandbox = await Sandbox.create({
    apiKey: env.e2bApiKey,
    timeoutMs: SANDBOX_TIMEOUT_MS,
  });
  const sandboxId = sandbox.sandboxId;
  sandboxCache.set(projectId, { sandboxId, sandbox });
  return { sandbox, sandboxId, isNew: true };
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

/** Write a batch of files from DB records into the sandbox filesystem. */
export async function restoreFilesToSandbox(
  sandbox: Sandbox,
  files: SandboxFile[]
): Promise<void> {
  const writeEntries = files
    .filter((f) => !f.isFolder)
    .map((f) => ({
      path: `${BUILDER_SANDBOX_WORKDIR}/${f.path.replace(/^\/+/, "")}`,
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
    if (entry.type === "dir") {
      results.push({ path: relPath, content: "", isFolder: true });
      await listSandboxFilesRecurse(sandbox, fullPath, relPath, results);
    } else {
      const content = await sandbox.files.read(fullPath).catch(() => "");
      results.push({ path: relPath, content: content as string, isFolder: false });
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
