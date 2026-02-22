export type FileEncoding = "text" | "base64";

export type ProjectFile = {
  path: string; // e.g., "src/index.ts"
  content: string;
  encoding?: FileEncoding;
  mimeType?: string;
};

export type Project = {
  id: string;
  name: string;
  files: ProjectFile[];
  activeFilePath?: string;
  openFilePaths?: string[];
  dirtyFiles?: string[];
  updatedAt: number;
  createdAt: number;
  isPlayground?: boolean;
  expiresAt?: number;
};

/**
 * State: Playground vs Auth mode
 * - Playground: isPlayground true; projects are temporary (24h TTL), stored in localStorage and
 *   synced to backend with is_playground=true and owner_id=null. Sessions are isolated per
 *   project id (playground-{uuid}); users do not see each other's data. Cleanup job deletes
 *   expired playground projects and their files.
 * - Auth: isPlayground false; projects are persisted to backend with owner_id; list/filter by
 *   userId so users only access their own data.
 */
const STORAGE_KEY = "vibecoder.projects";
const PLAYGROUND_STORAGE_KEY = "vibecoder.playground.projects";
const PLAYGROUND_STORAGE_LIMIT_BYTES = 512 * 1024; // 512 KB cap for playground cache
export const PLAYGROUND_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function generateUuid(): string {
  // Simple RFC4122 v4-ish UUID generator suitable for client-side
  // Not cryptographically strong; fine for local usage
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function readProjectsFromStorage(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Project[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeProjectsToStorage(projects: Project[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function readPlaygroundProjects(now: number = Date.now()): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PLAYGROUND_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Project[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((project) => project.expiresAt && project.expiresAt > now)
      .map((project) => ({ ...project, isPlayground: true }));
  } catch {
    return [];
  }
}

function isQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: string; code?: number };
  return (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 ||
    err.code === 1014
  );
}

export function writePlaygroundProjects(projects: Project[]): boolean {
  if (typeof window === "undefined") return true;

  try {
    const payload = JSON.stringify(projects);
    const size = new Blob([payload]).size;
    if (size > PLAYGROUND_STORAGE_LIMIT_BYTES) {
      console.warn(
        `[playground] Skipping cache write: payload size ${size} exceeds limit of ${PLAYGROUND_STORAGE_LIMIT_BYTES} bytes.`,
      );
      return false;
    }
    window.localStorage.setItem(PLAYGROUND_STORAGE_KEY, payload);
    return true;
  } catch (error) {
    if (isQuotaExceeded(error)) {
      console.warn("[playground] Skipping cache write due to storage quota limit.", error);
      return false;
    }
    throw error;
  }
}

export function pruneExpiredPlaygroundProjects(now: number = Date.now()): void {
  const remaining = readPlaygroundProjects(now);
  writePlaygroundProjects(remaining);
}

export function findProject(projects: Project[], id: string | undefined): Project | undefined {
  if (!id) return undefined;
  return projects.find(p => p.id === id);
}

export function createDefaultProject(name?: string): Project {
  const now = Date.now();
  const projectId = generateUuid();
  const files: ProjectFile[] = [
    {
      path: "README.md",
      content: `# ${name || "New Project"}\n\nWelcome to your project!\n`,
    },
    {
      path: "src/index.ts",
      content: "export const hello = () => 'Hello, VibeCoder!';\n",
    },
  ];
  return {
    id: projectId,
    name: name || "Untitled Project",
    files,
    activeFilePath: files[0].path,
    openFilePaths: [files[0].path],
    dirtyFiles: [],
    createdAt: now,
    updatedAt: now,
    isPlayground: false,
  };
}

export function upsertProject(projects: Project[], project: Project): Project[] {
  const index = projects.findIndex(p => p.id === project.id);
  if (index === -1) return [project, ...projects];
  const next = [...projects];
  next[index] = project;
  return next;
}

export function deleteProject(projects: Project[], id: string): Project[] {
  return projects.filter(p => p.id !== id);
}

export function upsertFile(
  project: Project,
  path: string,
  content: string,
  encoding?: FileEncoding,
  mimeType?: string,
): Project {
  // Ensure files array exists
  const existingFiles = project.files || [];
  const idx = existingFiles.findIndex(f => f.path === path);
  const files = [...existingFiles];
  if (idx === -1) {
    files.push({ path, content, ...(encoding ? { encoding } : {}), ...(mimeType ? { mimeType } : {}) });
  } else {
    const previous = existingFiles[idx];
    files[idx] = {
      path,
      content,
      encoding: encoding ?? previous.encoding,
      mimeType: mimeType ?? previous.mimeType,
    };
  }
  return { ...project, files, updatedAt: Date.now() };
}

export function deleteFile(project: Project, path: string): Project {
  const existingFiles = project.files || [];
  const files = existingFiles.filter(f => f.path !== path);
  let activeFilePath = project.activeFilePath;
  if (activeFilePath === path) {
    // pick next open tab if available, else first file
    const remainingTabs = (project.openFilePaths || []).filter(p => p !== path);
    activeFilePath = remainingTabs[remainingTabs.length - 1] || files[0]?.path;
  }
  const openFilePaths = (project.openFilePaths || []).filter(p => p !== path);
  return { ...project, files, activeFilePath, openFilePaths, updatedAt: Date.now() };
}

export function setActiveFile(project: Project, path: string | undefined): Project {
  let openFilePaths = project.openFilePaths || [];
  if (path && !openFilePaths.includes(path)) openFilePaths = [...openFilePaths, path];
  return { ...project, activeFilePath: path, openFilePaths, updatedAt: Date.now() };
}

export function ensureOpenFile(project: Project, path: string): Project {
  const openFilePaths = project.openFilePaths || [];
  if (openFilePaths.includes(path)) return { ...project, activeFilePath: path, updatedAt: Date.now() };
  return { ...project, activeFilePath: path, openFilePaths: [...openFilePaths, path], updatedAt: Date.now() };
}

export function closeOpenFile(project: Project, path: string): Project {
  const open = (project.openFilePaths || []).filter(p => p !== path);
  let active = project.activeFilePath;
  if (active === path) {
    const existingFiles = project.files || [];
    active = open[open.length - 1] || existingFiles[0]?.path;
  }
  const dirtyFiles = (project.dirtyFiles || []).filter(p => p !== path);
  return { ...project, openFilePaths: open, activeFilePath: active, dirtyFiles, updatedAt: Date.now() };
}

export function renameFile(project: Project, oldPath: string, newPath: string): Project {
  if (oldPath === newPath) return project;
  const existingFiles = project.files || [];
  const files = existingFiles.map(f =>
    f.path === oldPath
      ? {
          path: newPath,
          content: f.content,
          encoding: f.encoding,
          mimeType: f.mimeType,
        }
      : f,
  );
  const openFilePaths = (project.openFilePaths || []).map(p => p === oldPath ? newPath : p);
  const activeFilePath = project.activeFilePath === oldPath ? newPath : project.activeFilePath;
  return { ...project, files, openFilePaths, activeFilePath, updatedAt: Date.now() };
}

export function createFolder(project: Project, folderPath: string): Project {
  const normalized = folderPath.replace(/\\/g, "/").replace(/\/$/, "");
  const placeholder = `${normalized}/.keep`;
  const existingFiles = project.files || [];
  if (existingFiles.some(f => f.path === placeholder)) return project;
  const files = [...existingFiles, { path: placeholder, content: "" }];
  return { ...project, files, updatedAt: Date.now() };
}

export function renameFolder(project: Project, oldPrefix: string, newPrefix: string): Project {
  const from = oldPrefix.replace(/\\/g, "/").replace(/\/$/, "");
  const to = newPrefix.replace(/\\/g, "/").replace(/\/$/, "");
  if (from === to) return project;
  const existingFiles = project.files || [];
  const files = existingFiles.map(f =>
    f.path.startsWith(from + "/")
      ? {
          path: f.path.replace(from + "/", to + "/"),
          content: f.content,
          encoding: f.encoding,
          mimeType: f.mimeType,
        }
      : f,
  );
  const openFilePaths = (project.openFilePaths || []).map(p => p.startsWith(from + "/") ? p.replace(from + "/", to + "/") : p);
  const activeFilePath = project.activeFilePath && project.activeFilePath.startsWith(from + "/") ? project.activeFilePath.replace(from + "/", to + "/") : project.activeFilePath;
  const dirtyFiles = (project.dirtyFiles || []).map(p => p.startsWith(from + "/") ? p.replace(from + "/", to + "/") : p);
  return { ...project, files, openFilePaths, activeFilePath, dirtyFiles, updatedAt: Date.now() };
}

export function markDirty(project: Project, path: string): Project {
  const dirtyFiles = project.dirtyFiles || [];
  if (dirtyFiles.includes(path)) return project;
  return { ...project, dirtyFiles: [...dirtyFiles, path], updatedAt: Date.now() };
}

export function markClean(project: Project, path: string): Project {
  const dirtyFiles = (project.dirtyFiles || []).filter(p => p !== path);
  return { ...project, dirtyFiles, updatedAt: Date.now() };
}

export function saveFile(project: Project, path: string, content: string): Project {
  const existing = (project.files || []).find(f => f.path === path);
  const next = upsertFile(project, path, content, existing?.encoding, existing?.mimeType);
  return markClean(next, path);
}

