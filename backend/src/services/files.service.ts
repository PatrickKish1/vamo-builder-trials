import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient, getSupabaseClientWithAuth } from "../config/supabase.js";
import type { ProjectFileResponse } from "../types/api.types.js";
import {
  validatePath,
  validateExtension,
  validateContentSize,
  sanitizePath,
  MAX_FILE_SIZE,
} from "../utils/pathValidation.js";
import { badRequest, dbError } from "../utils/errors.js";

function supabaseForRequest(accessToken: string | undefined): SupabaseClient {
  return accessToken
    ? getSupabaseClientWithAuth(accessToken)
    : getSupabaseClient();
}

function rowToFile(row: {
  path: string;
  content: string | null;
  encoding: string | null;
  mime_type: string | null;
  is_folder: boolean;
  project_id: string;
  owner_id: string | null;
}): ProjectFileResponse {
  return {
    path: row.path,
    content: row.content ?? "",
    encoding: row.encoding ?? undefined,
    mimeType: row.mime_type ?? undefined,
    isFolder: row.is_folder,
    projectId: row.project_id,
    userId: row.owner_id,
  };
}

export async function listFiles(
  accessToken: string | undefined,
  projectId: string,
  path?: string | null
): Promise<{ files: ProjectFileResponse[] }> {
  if (!projectId) throw badRequest("Project ID is required");
  const supabase = supabaseForRequest(accessToken);
  let query = supabase
    .from("project_files")
    .select("path, content, encoding, mime_type, is_folder, project_id, owner_id")
    .eq("project_id", projectId);
  if (path) query = query.eq("path", path);
  const { data, error } = await query;
  if (error) throw dbError("Failed to load files. Please try again.");
  const files = (data ?? []).map((row) => rowToFile(row as Parameters<typeof rowToFile>[0]));
  return { files };
}

export type FileAction = "create" | "update" | "delete" | "rename";

export async function applyFileAction(
  accessToken: string | undefined,
  params: {
    action: FileAction;
    path: string;
    projectId: string;
    userId?: string | null;
    content?: string;
    isFolder?: boolean;
    newPath?: string;
    encoding?: "text" | "base64";
    mimeType?: string;
  }
): Promise<{ ok: boolean; id?: string }> {
  const {
    action,
    path,
    projectId,
    userId,
    content,
    isFolder,
    newPath,
    encoding,
    mimeType,
  } = params;

  if (!path) throw badRequest("Path is required");
  if (!projectId) throw badRequest("Project ID is required");
  if (!validatePath(path)) throw badRequest("Invalid file path");
  if (!isFolder && !validateExtension(path)) {
    throw badRequest("File type not allowed. Only code and text files are permitted.");
  }
  if (!isFolder && content !== undefined && !validateContentSize(content)) {
    throw badRequest(`File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  const sanitizedPath = sanitizePath(path);
  const supabase = supabaseForRequest(accessToken);
  const isPlayground = projectId.startsWith("playground-");

  if (action === "delete") {
    if (isFolder) {
      const { data: list } = await supabase
        .from("project_files")
        .select("id")
        .eq("project_id", projectId)
        .like("path", `${sanitizedPath}%`);
      for (const row of list ?? []) {
        await supabase.from("project_files").delete().eq("id", (row as { id: string }).id);
      }
    } else {
      await supabase
        .from("project_files")
        .delete()
        .eq("project_id", projectId)
        .eq("path", sanitizedPath);
    }
    return { ok: true };
  }

  if (action === "rename") {
    if (!newPath) throw badRequest("newPath is required for rename");
    if (!validatePath(newPath)) throw badRequest("Invalid new file path");
    if (!isFolder && !validateExtension(newPath)) {
      throw badRequest("File type not allowed.");
    }
    const sanitizedNew = sanitizePath(newPath);
    if (isFolder) {
      const { data: list } = await supabase
        .from("project_files")
        .select("id, path")
        .eq("project_id", projectId)
        .like("path", `${sanitizedPath}%`);
      for (const row of list ?? []) {
        const r = row as { id: string; path: string };
        const suffix = r.path.slice(sanitizedPath.length);
        await supabase
          .from("project_files")
          .update({ path: sanitizedNew + suffix, updated_at: new Date().toISOString() })
          .eq("id", r.id);
      }
    } else {
      await supabase
        .from("project_files")
        .update({ path: sanitizedNew, updated_at: new Date().toISOString() })
        .eq("project_id", projectId)
        .eq("path", sanitizedPath);
    }
    return { ok: true };
  }

  if (!isFolder && content === undefined) {
    throw badRequest("Content is required for create/update");
  }

  const { data: existing } = await supabase
    .from("project_files")
    .select("id")
    .eq("project_id", projectId)
    .eq("path", sanitizedPath)
    .maybeSingle();

  const ownerId = isPlayground ? null : userId ?? null;

  if (existing) {
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      ...(ownerId !== undefined ? { owner_id: ownerId } : {}),
    };
    if (isFolder) {
      update.is_folder = true;
    } else {
      update.content = content ?? "";
      if (encoding) update.encoding = encoding;
      if (mimeType) update.mime_type = mimeType;
    }
    const { data: updated, error } = await supabase
      .from("project_files")
      .update(update)
      .eq("id", (existing as { id: string }).id)
      .select("id")
      .single();
    if (error) throw dbError("Failed to update file. Please try again.");
    return { ok: true, id: (updated as { id: string })?.id };
  }

  const insert: Record<string, unknown> = {
    project_id: projectId,
    path: sanitizedPath,
    is_folder: !!isFolder,
    owner_id: ownerId,
    content: isFolder ? "" : (content ?? ""),
    encoding: encoding ?? "text",
    mime_type: mimeType ?? null,
  };
  const { data: created, error } = await supabase
    .from("project_files")
    .insert(insert)
    .select("id")
    .single();
  if (error) throw dbError("Failed to save file. Please try again.");
  return { ok: true, id: (created as { id: string })?.id };
}
