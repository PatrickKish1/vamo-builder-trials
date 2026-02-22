import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient, getSupabaseClientWithAuth } from "../config/supabase.js";
import type { ProjectResponse } from "../types/api.types.js";
import { badRequest, dbError, notFound, unauthorized } from "../utils/errors.js";
import { isSupabaseAuthError } from "../utils/errors.js";

function supabaseForRequest(accessToken: string | undefined): SupabaseClient {
  return accessToken
    ? getSupabaseClientWithAuth(accessToken)
    : getSupabaseClient();
}

function rowToProject(row: {
  id: string;
  name: string;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  active_file_path: string | null;
  open_file_paths: unknown;
  dirty_files: unknown;
  is_playground: boolean;
  expires_at: string | null;
  github_repo_full_name?: string | null;
  github_sync_enabled?: boolean | null;
}): ProjectResponse {
  return {
    id: row.id,
    name: row.name,
    userId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activeFilePath: row.active_file_path,
    openFilePaths: Array.isArray(row.open_file_paths) ? row.open_file_paths : (row.open_file_paths as string[]) ?? [],
    dirtyFiles: Array.isArray(row.dirty_files) ? row.dirty_files : (row.dirty_files as string[]) ?? [],
    isPlayground: row.is_playground,
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
    githubRepoFullName: row.github_repo_full_name ?? undefined,
    githubSyncEnabled: row.github_sync_enabled ?? false,
  };
}

export async function listProjects(
  accessToken: string | undefined,
  userId?: string | null,
  projectId?: string | null
): Promise<{ projects?: ProjectResponse[]; project?: ProjectResponse | null }> {
  const supabase = supabaseForRequest(accessToken);

  if (projectId) {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      if (isSupabaseAuthError(error)) throw unauthorized("Session expired or invalid. Please sign in again.");
      throw dbError();
    }
    if (!data) return { project: null };
    return { project: rowToProject(data as Parameters<typeof rowToProject>[0]) };
  }

  let query = supabase.from("projects").select("*").order("updated_at", { ascending: false });
  if (userId) {
    query = query.eq("owner_id", userId);
  }

  const { data, error } = await query;
  if (error) {
    if (isSupabaseAuthError(error)) throw unauthorized("Session expired or invalid. Please sign in again.");
    throw dbError();
  }
  const projects = (data ?? []).map((row) => rowToProject(row as Parameters<typeof rowToProject>[0]));
  return { projects };
}

export async function createProject(
  accessToken: string | undefined,
  params: {
    name: string;
    id?: string;
    userId?: string | null;
    isPlayground?: boolean;
    expiresAt?: number;
  }
): Promise<{ project: ProjectResponse }> {
  const { name, id, userId, isPlayground, expiresAt } = params;
  if (!name?.trim()) throw badRequest("Project name is required");

  const supabase = supabaseForRequest(accessToken);
  const isPlaygroundProject = isPlayground ?? (id?.startsWith("playground-") ?? false);
  const projectExpiresAt = isPlaygroundProject
    ? (expiresAt ?? Date.now() + 24 * 60 * 60 * 1000)
    : undefined;

  const insert: Record<string, unknown> = {
    name: name.trim(),
    owner_id: isPlaygroundProject ? null : userId ?? null,
    active_file_path: null,
    open_file_paths: [],
    dirty_files: [],
    is_playground: isPlaygroundProject,
    ...(projectExpiresAt ? { expires_at: new Date(projectExpiresAt).toISOString() } : {}),
  };

  if (isPlaygroundProject && id) {
    const { data: existing } = await supabase.from("projects").select("id").eq("id", id).maybeSingle();
    if (existing) {
      const { data: updated, error } = await supabase
        .from("projects")
        .update({
          name: insert.name,
          updated_at: new Date().toISOString(),
          ...(projectExpiresAt ? { expires_at: new Date(projectExpiresAt).toISOString() } : {}),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw dbError();
      return { project: rowToProject(updated as Parameters<typeof rowToProject>[0]) };
    }
    insert.id = id;
  }

  const { data, error } = await supabase.from("projects").insert(insert).select().single();
  if (error) throw dbError();
  return { project: rowToProject(data as Parameters<typeof rowToProject>[0]) };
}

export async function updateProject(
  accessToken: string | undefined,
  params: {
    id: string;
    name?: string;
    activeFilePath?: string | null;
    openFilePaths?: string[];
    dirtyFiles?: string[];
  }
): Promise<{ project: ProjectResponse }> {
  const { id, name, activeFilePath, openFilePaths, dirtyFiles } = params;
  if (!id) throw badRequest("Project ID is required");

  const supabase = supabaseForRequest(accessToken);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) update.name = name;
  if (activeFilePath !== undefined) update.active_file_path = activeFilePath;
  if (openFilePaths !== undefined) update.open_file_paths = openFilePaths;
  if (dirtyFiles !== undefined) update.dirty_files = dirtyFiles;

  const { data, error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) throw dbError();
  if (!data) throw notFound("Project not found");
  return { project: rowToProject(data as Parameters<typeof rowToProject>[0]) };
}

export async function deleteProject(accessToken: string | undefined, id: string): Promise<void> {
  if (!id) throw badRequest("Project ID is required");
  const supabase = supabaseForRequest(accessToken);
  await supabase.from("project_files").delete().eq("project_id", id);
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw dbError();
}
