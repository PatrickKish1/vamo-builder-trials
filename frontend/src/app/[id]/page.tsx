"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { TopBar, ProjectSidebar, CodeEditor, TabsBar } from "@/components/ide";
import { CallPanel } from "@/components/CallPanel";
import { FileUpload } from "@/components/FileUpload";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { useAuth } from "@/contexts/AuthContext";
import {
  Project,
  deleteFile as deleteProjectFile,
  setActiveFile,
  upsertFile,
  findProject,
  createFolder,
  renameFile,
  renameFolder,
  markDirty,
  saveFile,
  createDefaultProject,
  generateUuid,
  readPlaygroundProjects,
  writePlaygroundProjects,
  upsertProject,
  PLAYGROUND_TTL,
} from "@/lib/projects";
import { apiV1, authFetch } from "@/lib/api";
import { toast } from "sonner";

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading, isPlayground, sessionToken, logout, setPlaygroundMode } = useAuth();
  const projectId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined);

  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const [createProjectModalOpen, setCreateProjectModalOpen] = useState(false);
  const sidebarWidthPrefKey = "vibecoder.sidebarWidth";
  const sidebarMinWidth = 220;
  const sidebarMaxWidth = 480;
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 256;
    const stored = window.localStorage.getItem(sidebarWidthPrefKey);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    if (!Number.isFinite(parsed)) {
      return 256;
    }
    return Math.min(sidebarMaxWidth, Math.max(sidebarMinWidth, parsed));
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(sidebarWidthPrefKey, String(sidebarWidth));
  }, [sidebarWidth]);

  // Initialize playground project from database or create new one
  useEffect(() => {
    if (!isPlayground || projectId) {
      // If we have a projectId, the effect above will handle loading it
      return;
    }

    // No projectId specified - create a new playground project
    const initializeNewPlayground = async () => {
      const baseId = `playground-${generateUuid()}`;
      const fresh = createDefaultProject("Playground");
      const seeded: Project = {
        ...fresh,
        id: baseId,
        files: [],
        activeFilePath: undefined,
        openFilePaths: [],
        dirtyFiles: [],
        isPlayground: true,
        updatedAt: Date.now(),
        expiresAt: Date.now() + PLAYGROUND_TTL,
      };
      
      // Create project in database
      try {
        await authFetch(apiV1("/projects"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: baseId,
            name: seeded.name,
            isPlayground: true,
            expiresAt: seeded.expiresAt,
          }),
        });
      } catch (error) {
        console.error("Failed to create playground project in database:", error);
      }
      
      writePlaygroundProjects([seeded]);
      setProjects([seeded]);
      setProject(seeded);
      router.replace(`/${baseId}`);
    };
    
    initializeNewPlayground();
  }, [isPlayground, projectId, router]);

  const handleSidebarResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const next = Math.min(sidebarMaxWidth, Math.max(sidebarMinWidth, startWidth + delta));
      setSidebarWidth(next);
    };

    const handlePointerUp = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, [sidebarWidth, sidebarMinWidth, sidebarMaxWidth]);

  const loadProjectFiles = useCallback(async (projectId: string): Promise<Project["files"]> => {
    try {
      // Load files from database for both playground and authenticated projects
      const url = apiV1(`/files?projectId=${projectId}${user?.id ? `&userId=${encodeURIComponent(user.id)}` : ""}`);
      const response = await fetch(url, {
        headers: {
        },
      });
      const data = await response.json();
      if (data.files) {
        // Filter out folders (they have isFolder: true)
        return data.files
          .filter((f: any) => !f.isFolder)
          .map((f: any) => ({
            path: f.path,
            content: f.content || "",
            encoding: f.encoding || "text",
            mimeType: f.mimeType,
          }));
      }
      return [];
    } catch (error) {
      console.error("Failed to load files from server:", error);
      return [];
    }
  }, [user?.id, sessionToken]);

  const loadProjectsFromBackend = useCallback(async () => {
    // Don't load from server in playground mode
    if (isPlayground) {
      return;
    }

    try {
      const url = user?.id
        ? apiV1(`/projects?userId=${encodeURIComponent(user.id)}`)
        : apiV1("/projects");
      const response = await fetch(url, {
        headers: {
        },
      });
      const data = await response.json();
      if (data.projects && data.projects.length > 0) {
        const normalized = data.projects.map((p: Project) => ({
          ...p,
          files: [], // Will be loaded separately
          openFilePaths: p.openFilePaths || [],
          dirtyFiles: p.dirtyFiles || [],
        }));
        setProjects(normalized);
        
        // Load files for the target project
        const targetId = projectId || normalized[0].id;
        const target = findProject(normalized, targetId) || normalized[0];
        const files = await loadProjectFiles(target.id);
        const projectWithFiles = { ...target, files };
        setProject(projectWithFiles);
        
        if (!projectId || target.id !== projectId) {
          router.replace(`/${target.id}`);
        }
      } else {
        // Create default project if none exist (only for authenticated users)
        if (user?.id) {
          const response = await authFetch(apiV1("/projects"), {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: "Welcome Project", userId: user.id })
          });
          const data = await response.json();
          if (data.project) {
            const projectWithFiles = { ...data.project, files: [] };
            setProjects([projectWithFiles]);
            setProject(projectWithFiles);
            router.replace(`/${data.project.id}`);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load projects from server:", error);
    }
  }, [user?.id, sessionToken, isPlayground, projectId, router, loadProjectFiles]);

  // Load projects from server when auth state changes (only for authenticated users)
  useEffect(() => {
    if (!authLoading && !isPlayground) {
      loadProjectsFromBackend();
    }
  }, [authLoading, isPlayground, loadProjectsFromBackend]);
  
  // For playground projects, load from database if projectId exists
  useEffect(() => {
    if (!isPlayground || !projectId) return;
    
    const loadPlaygroundProject = async () => {
      try {
        // First check if project exists in database
        const projectResponse = await authFetch(apiV1(`/projects?projectId=${projectId}`));
        const projectData = await projectResponse.json();
        
        if (projectData.project) {
          // Project exists in database, load files
          const files = await loadProjectFiles(projectId);
          const projectWithFiles = {
            ...projectData.project,
            files,
            isPlayground: true,
          };
          setProject(projectWithFiles);
          setProjects([projectWithFiles]);
        } else {
          // Project doesn't exist in database yet, use localStorage version
          const stored = readPlaygroundProjects();
          const target = stored.find(p => p.id === projectId);
          if (target) {
            // Create project in database first
            try {
              await authFetch(apiV1("/projects"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: target.id,
                  name: target.name,
                  isPlayground: true,
                  expiresAt: target.expiresAt || Date.now() + PLAYGROUND_TTL,
                }),
              });
              
              // If target has files, upload them to database
              if (target.files && target.files.length > 0) {
                const formData = new FormData();
                formData.append("projectId", target.id);
                formData.append("playground", "true");
                
                target.files.forEach((file) => {
                  if (file.encoding === "base64") {
                    const byteCharacters = atob(file.content);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                      byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: file.mimeType || "application/octet-stream" });
                    const filename = file.path.split("/").pop() || "file";
                    formData.append(file.path, blob, filename);
                  } else {
                    const blob = new Blob([file.content], { type: file.mimeType || "text/plain" });
                    const filename = file.path.split("/").pop() || "file";
                    formData.append(file.path, blob, filename);
                  }
                });
                
                await authFetch(apiV1("/files/upload"), {
                  method: "POST",
                  body: formData,
                });
              }
              
              // Load files from database after upload
              const files = await loadProjectFiles(target.id);
              const projectWithFiles = {
                ...target,
                files,
                isPlayground: true,
              };
              setProject(projectWithFiles);
              setProjects([projectWithFiles]);
            } catch (error) {
              console.error("Failed to create project in database:", error);
              // Fallback to localStorage version
              setProject(target);
              setProjects([target]);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load playground project:", error);
        // Fallback to localStorage
        const stored = readPlaygroundProjects();
        const target = stored.find(p => p.id === projectId);
        if (target) {
          setProject(target);
          setProjects([target]);
        }
      }
    };
    
    loadPlaygroundProject();
  }, [isPlayground, projectId, loadProjectFiles]);

  // Load specific project when projectId changes
  useEffect(() => {
    if (projects.length > 0 && projectId) {
      const target = findProject(projects, projectId);
      if (target) {
        loadProjectFiles(target.id).then(files => {
          const projectWithFiles = { ...target, files };
          setProject(projectWithFiles);
        });
      } else if (projectId !== project?.id) {
        // If project not found, redirect to first project
        router.replace(`/${projects[0].id}`);
      }
    }
  }, [projectId, projects, loadProjectFiles, project?.id, router]);

  // Realtime sync with server changes
  useEffect(() => {
    if (!project) return;
    const currentProjectId = project.id;
    
    const es = new EventSource(apiV1("/realtime"));
    const onCreated = (e: MessageEvent) => {
      try {
        const data = JSON.parse((e as any).data);
        if (data.projectId !== currentProjectId) return;
        setProject((prev) => {
          if (!prev || prev.id !== currentProjectId) return prev;
          return upsertFile(prev, data.path, data.content ?? "");
        });
      } catch {}
    };
    const onUpdated = (e: MessageEvent) => {
      try {
        const data = JSON.parse((e as any).data);
        if (data.projectId !== currentProjectId) return;
        setProject((prev) => {
          if (!prev || prev.id !== currentProjectId) return prev;
          return upsertFile(prev, data.path, data.content ?? "");
        });
      } catch {}
    };
    const onRenamed = (e: MessageEvent) => {
      try {
        const data = JSON.parse((e as any).data);
        if (data.projectId !== currentProjectId) return;
        setProject((prev) => {
          if (!prev || prev.id !== currentProjectId) return prev;
          return renameFile(prev, data.oldPath, data.newPath);
        });
      } catch {}
    };
    const onDeleted = (e: MessageEvent) => {
      try {
        const data = JSON.parse((e as any).data);
        if (data.projectId !== currentProjectId) return;
        setProject((prev) => {
          if (!prev || prev.id !== currentProjectId) return prev;
          return deleteProjectFile(prev, data.path);
        });
      } catch {}
    };
    es.addEventListener('file:created', onCreated as any);
    es.addEventListener('file:updated', onUpdated as any);
    es.addEventListener('file:renamed', onRenamed as any);
    es.addEventListener('file:deleted', onDeleted as any);
    return () => {
      try { es.close(); } catch {}
    };
  }, [project?.id]);

  const activeFile = useMemo(() => {
    if (!project || !project.activeFilePath || !project.files) return undefined;
    return project.files.find(f => f.path === project.activeFilePath);
  }, [project]);
  const openTabs = project?.openFilePaths || (project?.activeFilePath ? [project.activeFilePath] : []);

  const persist = useCallback(
    (next: Project) => {
      const isLocal = isPlayground || next.id.startsWith("playground-");
      const normalized: Project = isLocal
        ? {
            ...next,
            isPlayground: true,
            expiresAt: Date.now() + PLAYGROUND_TTL,
          }
        : next;

      setProject(normalized);
      setProjects((prev) => {
        const updated = upsertProject(prev, normalized);

        if (isLocal) {
          const stored = updated.map((proj) => ({
            ...proj,
            isPlayground: true,
            expiresAt: proj.expiresAt ?? Date.now() + PLAYGROUND_TTL,
            files: proj.files || [],
            openFilePaths: proj.openFilePaths || [],
            dirtyFiles: proj.dirtyFiles || [],
          }));
          writePlaygroundProjects(stored);
          return stored;
        }

        return updated;
      });

      if (!isLocal && user?.id) {
        authFetch(apiV1("/projects"), {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: normalized.id,
            name: normalized.name,
            activeFilePath: normalized.activeFilePath || null,
            openFilePaths: normalized.openFilePaths || [],
            dirtyFiles: normalized.dirtyFiles || [],
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
              console.error("Failed to sync project to server:", response.status, errorData);
            }
          })
          .catch((error) => {
            console.error("Failed to sync project to server (network error):", error);
          });
      }
    },
    [isPlayground, sessionToken, user?.id],
  );

  function handleCreateProject() {
    setCreateProjectModalOpen(true);
  }

  async function handleEmptyProject(name: string) {
    const projectName = name.trim() || "New Project";
    if (isPlayground) {
      const fresh = createDefaultProject(projectName);
      const newId = `playground-${generateUuid()}`;
      const normalized: Project = {
        ...fresh,
        id: newId,
        name: projectName,
        files: [],
        activeFilePath: undefined,
        openFilePaths: [],
        dirtyFiles: [],
        isPlayground: true,
        updatedAt: Date.now(),
        expiresAt: Date.now() + PLAYGROUND_TTL,
      };

      setProject(normalized);
      setProjects((prev) => {
        const updated = upsertProject(prev, normalized);
        const stored = updated.map((proj) => ({
          ...proj,
          isPlayground: true,
          expiresAt: proj.expiresAt ?? Date.now() + PLAYGROUND_TTL,
        }));
        writePlaygroundProjects(stored);
        return stored;
      });
      router.push(`/${newId}`);
      return;
    }

    if (!user?.id) {
      setLoginDialogOpen(true);
      return;
    }

    try {
      const response = await authFetch(apiV1("/projects"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: projectName, userId: user.id }),
      });
      const data = await response.json();
      if (data.project) {
        const projectWithFiles = { ...data.project, files: [] };
        const updated = [projectWithFiles, ...projects];
        setProjects(updated);
        setProject(projectWithFiles);
        router.push(`/${data.project.id}`);
      }
    } catch (error) {
      console.error("Failed to create project:", error);
    }
  }

  async function handleBuildProjectWithAI(description: string): Promise<void> {
    const prompt = `Create a new project. User request: ${description}\n\nRespond with code actions only: use the exact format with \`\`\`action TYPE: create PATH: <path> DESCRIPTION: <short description> \`\`\` followed by a code block for file content. Create the folder structure and initial files (e.g. README.md, main entry file). No conversational response—only action blocks and code.`;
    try {
      const chatRes = await authFetch(apiV1("/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: `create-${generateUuid()}`,
          prompt,
          context: {},
        }),
      });
      const chatData = await chatRes.json();
      const codeActions = chatData.codeActions ?? [];
      if (codeActions.length === 0) {
        throw new Error("No project structure generated. Try a more specific description.");
      }

      const projectName =
        description.slice(0, 50).trim() || "AI Project";
      let newProjectId: string;

      if (isPlayground) {
        const newId = `playground-${generateUuid()}`;
        const fresh: Project = {
          id: newId,
          name: projectName,
          files: [],
          activeFilePath: undefined,
          openFilePaths: [],
          dirtyFiles: [],
          updatedAt: Date.now(),
          createdAt: Date.now(),
          isPlayground: true,
          expiresAt: Date.now() + PLAYGROUND_TTL,
        };
        try {
          await authFetch(apiV1("/projects"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: projectName,
              id: newId,
              isPlayground: true,
              expiresAt: fresh.expiresAt,
            }),
          });
        } catch {
          // continue with local state
        }
        setProject(fresh);
        setProjects((prev) => upsertProject(prev, fresh));
        const stored = upsertProject(readPlaygroundProjects(), fresh).map((p) => ({
          ...p,
          isPlayground: true,
          expiresAt: p.expiresAt ?? Date.now() + PLAYGROUND_TTL,
        }));
        writePlaygroundProjects(stored);
        newProjectId = newId;
      } else {
        if (!user?.id) {
          setLoginDialogOpen(true);
          throw new Error("Sign in to create a stored project.");
        }
        const projRes = await authFetch(apiV1("/projects"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: projectName, userId: user.id }),
        });
        const projData = await projRes.json();
        if (!projData.project?.id) throw new Error("Failed to create project");
        newProjectId = projData.project.id;
        const projectWithFiles = { ...projData.project, files: [] };
        setProjects((prev) => [projectWithFiles, ...prev]);
        setProject(projectWithFiles);
      }

      const actions = Array.isArray(codeActions) ? codeActions : [codeActions];
      const withContent = actions.filter(
        (a: { type?: string; path?: string; content?: string }) =>
          a.type === "create" && a.path
      ) as Array<{ type: "create"; path: string; content?: string; description?: string }>;
      const folderPaths = new Set<string>();
      for (const a of withContent) {
        const parts = a.path.split("/").filter(Boolean);
        let prefix = "";
        for (let i = 0; i < parts.length - 1; i++) {
          prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
          folderPaths.add(prefix);
        }
      }
      const sortedFolders = Array.from(folderPaths).sort(
        (a, b) => a.split("/").length - b.split("/").length
      );
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      for (const folderPath of sortedFolders) {
        await authFetch(apiV1("/files"), {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "create",
            path: folderPath,
            projectId: newProjectId,
            isFolder: true,
            ...(user?.id && !isPlayground ? { userId: user.id } : {}),
          }),
        });
      }
      for (const a of withContent) {
        if (a.content == null) continue;
        await authFetch(apiV1("/files"), {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "create",
            path: a.path,
            content: a.content,
            projectId: newProjectId,
            ...(user?.id && !isPlayground ? { userId: user.id } : {}),
          }),
        });
      }

      router.push(`/${newProjectId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to build project";
      console.error(message, err);
      toast.error(message);
      throw err;
    }
  }

  function handleOpenProject() {
    if (projects.length <= 1) return;
    const idx = projects.findIndex(pr => pr.id === project?.id);
    const next = projects[(idx + 1) % projects.length];
    setProject(next);
    router.push(`/${next.id}`);
  }

  function handleRenameProject() {
    if (!project) return;
    const name = prompt("Project name", project.name) || project.name;
    persist({ ...project, name });
  }

  function handleSelectFile(path: string) {
    if (!project) return;
    persist(setActiveFile(project, path));
  }

  async function handleDeleteFile(path: string) {
    if (!project) return;
    const next = deleteProjectFile(project, path);
    persist(next);
    if (!isPlayground && user?.id) {
      try {
        await authFetch(apiV1("/files"), {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            action: "delete", 
            path, 
            projectId: project.id,
            userId: user.id,
          })
        });
      } catch (error) {
        console.error("Failed to delete file from server:", error);
      }
    }
  }

  async function handleCreateFile(path: string) {
    if (!project) return;
    const next = upsertFile(project, path, "", "text");
    persist({ ...next, activeFilePath: path });
    if (!isPlayground && user?.id) {
      try {
        await authFetch(apiV1("/files"), {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            action: "create", 
            path, 
            content: "", 
            projectId: project.id,
            userId: user.id,
          })
        });
      } catch (error) {
        console.error("Failed to create file in server:", error);
      }
    }
  }

  async function handleCreateFolder(path: string) {
    if (!project) return;
    const next = createFolder(project, path);
    persist(next);
    if (!isPlayground && user?.id) {
      // Sync to server - create .keep file for folder
      const folderPath = path.replace(/\\/g, "/").replace(/\/$/, "");
      const placeholder = `${folderPath}/.keep`;
      try {
        await authFetch(apiV1("/files"), {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            action: "create", 
            path: placeholder, 
            isFolder: true, 
            projectId: project.id,
            userId: user.id,
          })
        });
      } catch (error) {
        console.error("Failed to create folder in server:", error);
      }
    }
  }

  async function handleRename(oldPath: string, newPath: string, isFolder: boolean) {
    if (!project) return;
    const next = isFolder ? renameFolder(project, oldPath, newPath) : renameFile(project, oldPath, newPath);
    persist(next);
    if (!isPlayground && user?.id) {
      try {
        await authFetch(apiV1("/files"), {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            action: "rename", 
            path: oldPath, 
            newPath, 
            isFolder, 
            projectId: project.id,
            userId: user.id,
          })
        });
      } catch (error) {
        console.error("Failed to rename file in server:", error);
      }
    }
  }

  function handleChangeCode(code: string) {
    if (!project || !project.activeFilePath) return;
    const existing = project.files.find(f => f.path === project.activeFilePath);
    const next = markDirty(
      upsertFile(project, project.activeFilePath, code, existing?.encoding ?? "text", existing?.mimeType),
      project.activeFilePath,
    );
    persist(next);
    // Auto-save to server in real-time (only for authenticated users)
    if (!isPlayground && user?.id) {
      // Debounce API calls
      clearTimeout((handleChangeCode as any).timeout);
      (handleChangeCode as any).timeout = setTimeout(async () => {
        try {
          await authFetch(apiV1("/files"), {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ 
              action: "update", 
              path: project.activeFilePath, 
              content: code, 
              projectId: project.id,
              userId: user.id,
            })
          });
        } catch (error) {
          console.error("Failed to auto-save file to server:", error);
        }
      }, 1000); // 1 second debounce
    }
  }

  async function handleSave() {
    if (!project || !project.activeFilePath) return;
    const activeFile = project.files.find(f => f.path === project.activeFilePath);
    if (!activeFile) return;
    const next = saveFile(project, project.activeFilePath, activeFile.content);
    persist(next);
    if (!isPlayground && user?.id) {
      try {
        await authFetch(apiV1("/files"), {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            action: "update", 
            path: project.activeFilePath, 
            content: activeFile.content, 
            projectId: project.id,
            userId: user.id,
          })
        });
      } catch (error) {
        console.error("Failed to save file to server:", error);
      }
    }
  }

  async function handleCodeAction(action: any) {
    if (!project) return;
    
    console.log("Executing code action:", action);
    
    const isPlaygroundProject = project.id.startsWith("playground-") || project.isPlayground;
    
    // Handle multiple actions if action is an array
    const actions = Array.isArray(action) ? action : [action];
    
    for (const act of actions) {
      switch (act.type) {
        case "create":
          if (act.content) {
            console.log("Creating file:", act.path, "with content:", act.content.substring(0, 100) + "...");
            const next = upsertFile(project, act.path, act.content, "text");
            persist({ ...next, activeFilePath: act.path });
            
            // Save to database for both playground and authenticated projects
            try {
              await authFetch(apiV1("/files"), { 
                method: "POST", 
                headers: { 
                  "Content-Type": "application/json",
                }, 
                body: JSON.stringify({ 
                  action: "create", 
                  path: act.path, 
                  content: act.content, 
                  projectId: project.id,
                  ...(user?.id && !isPlaygroundProject ? { userId: user.id } : {}),
                }) 
              });
              // Reload files from database to ensure sync
              const loadedFiles = await loadProjectFiles(project.id);
              const updatedProject = { ...project, files: loadedFiles };
              setProject(updatedProject);
            } catch (error) {
              console.error("Failed to persist file to database:", error);
            }
          } else {
            console.log("No content provided for create action");
          }
          break;
        case "update":
          if (act.content) {
            console.log("Updating file:", act.path, "with content:", act.content.substring(0, 100) + "...");
            const existing = project.files.find((f) => f.path === act.path);
            const next = upsertFile(project, act.path, act.content, existing?.encoding ?? "text", existing?.mimeType);
            persist(next);
            
            // Save to database for both playground and authenticated projects
            try {
              await authFetch(apiV1("/files"), { 
                method: "POST", 
                headers: { 
                  "Content-Type": "application/json",
                }, 
                body: JSON.stringify({ 
                  action: "update", 
                  path: act.path, 
                  content: act.content, 
                  projectId: project.id,
                  encoding: existing?.encoding,
                  mimeType: existing?.mimeType,
                  ...(user?.id && !isPlaygroundProject ? { userId: user.id } : {}),
                }) 
              });
              // Reload files from database to ensure sync
              const loadedFiles = await loadProjectFiles(project.id);
              const updatedProject = { ...project, files: loadedFiles };
              setProject(updatedProject);
            } catch (error) {
              console.error("Failed to persist file to database:", error);
            }
          } else {
            console.log("No content provided for update action");
          }
          break;
        case "delete":
          console.log("Deleting file:", act.path);
          const next = deleteProjectFile(project, act.path);
          persist(next);
          
          // Delete from database for both playground and authenticated projects
          try {
            await authFetch(apiV1("/files"), { 
              method: "POST", 
              headers: { 
                "Content-Type": "application/json",
              }, 
              body: JSON.stringify({ 
                action: "delete", 
                path: act.path, 
                projectId: project.id,
                ...(user?.id && !isPlaygroundProject ? { userId: user.id } : {}),
              }) 
            });
            // Reload files from database to ensure sync
            const loadedFiles = await loadProjectFiles(project.id);
            const updatedProject = { ...project, files: loadedFiles };
            setProject(updatedProject);
          } catch (error) {
            console.error("Failed to delete file from database:", error);
          }
          break;
      }
    }
  }

  const [loginDialogOpen, setLoginDialogOpen] = useState(false);

  const handleFilesUploaded = useCallback(
    async (files: Array<{ path: string; content: string; isFolder: boolean; encoding?: "text" | "base64"; mimeType?: string }>) => {
    if (!project) return;
    
    // Ensure project exists in database (for playground projects)
    const isPlaygroundProject = project.id.startsWith("playground-") || project.isPlayground;
    
    try {
      // First, ensure the project exists in the database
      if (isPlaygroundProject) {
        await authFetch(apiV1("/projects"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: project.id,
            name: project.name,
            isPlayground: true,
            expiresAt: project.expiresAt || Date.now() + PLAYGROUND_TTL,
          }),
        });
      }
      
      // Upload files to database for both playground and authenticated projects
      // For playground projects, we'll use FormData to upload files
      if (isPlaygroundProject) {
        const formData = new FormData();
        formData.append("projectId", project.id);
        formData.append("playground", "true");
        
        files
          .filter(f => !f.isFolder)
          .forEach((f) => {
            const filename = f.path.split("/").pop();
            if (!filename) return;
            
            if (f.encoding === "base64") {
              // Convert base64 to blob
              const byteCharacters = atob(f.content);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: f.mimeType || "application/octet-stream" });
              formData.append(f.path, blob, filename);
            } else {
              const blob = new Blob([f.content], { type: f.mimeType || "text/plain" });
              formData.append(f.path, blob, filename);
            }
          });
        
        await authFetch(apiV1("/files/upload"), {
          method: "POST",
          headers: {
          },
          body: formData,
        });
      } else if (user?.id) {
        // For authenticated users, upload files
        const formData = new FormData();
        formData.append("projectId", project.id);
        formData.append("userId", user.id);
        formData.append("playground", "false");
        
        files
          .filter(f => !f.isFolder)
          .forEach((f) => {
            const filename = f.path.split("/").pop();
            if (!filename) return;
            
            if (f.encoding === "base64") {
              const byteCharacters = atob(f.content);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: f.mimeType || "application/octet-stream" });
              formData.append(f.path, blob, filename);
            } else {
              const blob = new Blob([f.content], { type: f.mimeType || "text/plain" });
              formData.append(f.path, blob, filename);
            }
          });
        
        await authFetch(apiV1("/files/upload"), {
          method: "POST",
          headers: {
          },
          body: formData,
        });
      }
      
      // Update local state
      const folders = files.filter(f => f.isFolder);
      let updated = project;
      folders.forEach(f => {
        updated = createFolder(updated, f.path);
      });
      
      files
        .filter(f => !f.isFolder)
        .forEach(f => {
          updated = upsertFile(updated, f.path, f.content, f.encoding, f.mimeType);
        });
      
      // Reload files from database to ensure sync
      const loadedFiles = await loadProjectFiles(project.id);
      updated = { ...updated, files: loadedFiles };
      
      persist(updated);
    } catch (error) {
      console.error("Failed to upload files to database:", error);
      // Still update local state even if database upload fails
      const folders = files.filter(f => f.isFolder);
      let updated = project;
      folders.forEach(f => {
        updated = createFolder(updated, f.path);
      });
      files
        .filter(f => !f.isFolder)
        .forEach(f => {
          updated = upsertFile(updated, f.path, f.content, f.encoding, f.mimeType);
        });
      persist(updated);
    }
  }, [project, persist, sessionToken, user?.id, loadProjectFiles]);

  if (authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!project) return null;

  const projectDisplayName = (project?.name ?? "").trim() || "Project";

  return (
    <div className="h-screen w-screen flex flex-col">
      <TopBar
        projectName={projectDisplayName}
        onCreateProject={handleCreateProject}
        onOpenProject={handleOpenProject}
        onRenameProject={handleRenameProject}
        user={user}
        isPlayground={isPlayground}
        onLoginClick={() => setLoginDialogOpen(true)}
        onLogout={logout}
        onTogglePlayground={(enabled) => {
          setPlaygroundMode(enabled);
          // Clear current project when switching modes
          if (enabled) {
            router.push("/");
          } else {
            loadProjectsFromBackend();
          }
        }}
      />
      <LoginDialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen} />
      <CreateProjectModal
        open={createProjectModalOpen}
        onOpenChange={setCreateProjectModalOpen}
        onEmptyProject={handleEmptyProject}
        onBuildWithAI={handleBuildProjectWithAI}
        onSpeakWithAgent={() => {
          setIsCalling(true);
        }}
        isPlayground={isPlayground}
      />
      <div className="flex flex-1 min-h-0">
        <div
          className="relative border-r flex flex-col"
          style={{ width: sidebarWidth, minWidth: sidebarMinWidth, maxWidth: sidebarMaxWidth }}
        >
          <ProjectSidebar
            projectName={projectDisplayName}
            files={project?.files || []}
            activePath={project?.activeFilePath}
            onSelectFile={handleSelectFile}
            onDeleteFile={handleDeleteFile}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onRename={handleRename}
          />
          <div className="border-t p-4">
            <FileUpload onFilesUploaded={handleFilesUploaded} projectId={project?.id} />
          </div>
          <div
            className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/40 transition-colors"
            onPointerDown={handleSidebarResizeStart}
          />
        </div>
        <div className="flex-1 grid grid-cols-[1fr_360px] min-h-0">
          <div className="border-r min-h-0">
            <TabsBar
              paths={openTabs}
              activePath={project?.activeFilePath}
              dirtyFiles={project?.dirtyFiles || []}
              onSelect={(p) => project && persist(setActiveFile(project, p))}
              onClose={(p) => {
                if (!project) return;
                const { closeOpenFile } = require("@/lib/projects");
                persist(closeOpenFile(project, p));
              }}
            />
            <CodeEditor
              path={activeFile?.path}
              value={activeFile?.content ?? ""}
              encoding={activeFile?.encoding}
              mimeType={activeFile?.mimeType}
              onChange={handleChangeCode}
              onSave={handleSave}
            />
          </div>
          <div className="min-h-0 p-2">
            <CallPanel
              isActive={isCalling}
              onStart={() => setIsCalling(true)}
              onEnd={() => setIsCalling(false)}
              onCodeAction={handleCodeAction}
              currentFile={activeFile?.path}
              projectFiles={project?.files}
              selectedCode={activeFile?.content}
              projectId={project.id}
              userId={user?.id}
              isPlaygroundProject={project?.isPlayground}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
