"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import BuilderOrb from "@/components/BuilderOrb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, Code, Play, RefreshCw, PanelRightClose, PanelRightOpen, FileCode, Download, ChevronLeft, MessageSquare, FolderOpen, Plus, BarChart3, Trash2, Copy, Wrench, Wallet, ShoppingBag, MoreVertical, Pencil, Plug, Check, X as XIcon, Zap, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { CallPanel } from "@/components/CallPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { BuilderCodeView } from "@/components/builder/BuilderCodeView";
import { BusinessPanel } from "@/components/builder/BusinessPanel";
import { IntegrationsDialog } from "@/components/builder/IntegrationsDialog";
import { ProjectLogoModal } from "@/components/builder/ProjectLogoModal";
import { apiV1 } from "@/lib/api";
import { cn } from "@/lib/utils";
import { reportCrash } from "@/lib/crashReporter";
import JSZip from "jszip";

type BuilderProjectItem = { id: string; name: string; framework: string; status: string };

function BuilderProjectsList({
  projects,
  loading,
  currentProjectId,
  onLoad,
  onSelect,
  onNewProject,
  onDelete,
}: {
  projects: BuilderProjectItem[];
  loading: boolean;
  currentProjectId: string;
  onLoad: () => void;
  onSelect: (id: string) => void;
  onNewProject?: () => void;
  onDelete?: (id: string) => void;
}) {
  useEffect(() => {
    onLoad();
  }, [onLoad]);
  return (
    <div className="p-3 space-y-3">
      {onNewProject && (
        <Button variant="outline" size="sm" className="w-full gap-2" onClick={onNewProject} aria-label="Start a new project">
          <Plus className="h-4 w-4" />
          New project
        </Button>
      )}
      <div className="space-y-1">
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No projects yet. Create one from the builder.</p>
      ) : (
        <ul className="space-y-1" role="list">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center gap-1 group">
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className={cn(
                  "flex-1 min-w-0 text-left px-3 py-2 rounded-md text-sm flex flex-col gap-0.5 transition-colors",
                  p.id === currentProjectId
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                aria-current={p.id === currentProjectId ? "true" : undefined}
              >
                <span className="truncate font-medium">{p.name}</span>
                <span className="text-xs opacity-80">{p.framework} · {p.status}</span>
              </button>
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(p.id);
                  }}
                  aria-label={`Delete ${p.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}

export default function BuilderBuildPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading, sessionToken } = useAuth();
  const projectId = params?.id as string;

  const [project, setProject] = useState<{
    name: string;
    framework: string;
    status: string;
    description?: string | null;
    logoUrl?: string | null;
    progressScore?: number;
    tractionSignals?: Array<{ type: string; description: string; createdAt: string }>;
    recentActivity?: Array<{ type: string; description: string; createdAt: string }>;
    linkedAssets?: Array<{ type: string; url: string; label?: string }>;
    founderName?: string | null;
    whyBuilt?: string | null;
    valuationLow?: number | null;
    valuationHigh?: number | null;
    projectRole?: "owner" | "collaborator";
    collaboratorPermission?: "view" | "edit";
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewRunning, setPreviewRunning] = useState(false);
  const [chatModelId, setChatModelId] = useState<string>(() => {
    if (typeof window === "undefined") return "groq";
    try {
      const stored = sessionStorage.getItem("builder_chat_model");
      return stored && ["groq", "openai", "claude", "gemini", "grok"].includes(stored) ? stored : "groq";
    } catch {
      return "groq";
    }
  });
  const [files, setFiles] = useState<Array<{ path: string; content?: string; isFolder?: boolean }>>([]);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"main" | "code">("main");
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [pineappleBalance, setPineappleBalance] = useState<number | null>(null);
  const [leftPanelTab, setLeftPanelTab] = useState<"chat" | "projects">("projects");
  const [centerTab, setCenterTab] = useState<"preview" | "business">("preview");
  const [builderProjects, setBuilderProjects] = useState<BuilderProjectItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  /** After scaffold is ready, send this prompt to the agent once so it generates and applies code. */
  const [triggerSendPrompt, setTriggerSendPrompt] = useState<string | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [cloningProject, setCloningProject] = useState(false);
  const [listingForSale, setListingForSale] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [logoModalOpen, setLogoModalOpen] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [chatReloadKey, setChatReloadKey] = useState(0);
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [offerLoading, setOfferLoading] = useState(false);
  const [offerData, setOfferData] = useState<{
    offerLow: number;
    offerHigh: number;
    reasoning: string;
    signals: { strengths: string[]; risks: string[] };
  } | null>(null);
  const scaffoldStartedRef = useRef(false);
  const builderPromptSentRef = useRef(false);
  const sidebarSlotRef = useRef<HTMLDivElement>(null);
  const sheetSlotRef = useRef<HTMLDivElement>(null);
  const hiddenSlotRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

  const loadProfile = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const response = await fetch(apiV1("/profile"), {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        const balance = data.profile?.pineapple_balance;
        setPineappleBalance(typeof balance === "number" ? balance : 0);
      } else {
        setPineappleBalance(0);
      }
    } catch {
      setPineappleBalance(0);
    }
  }, [sessionToken]);

  const loadFiles = useCallback(async () => {
    if (!projectId || !sessionToken) return;
    try {
      const response = await fetch(apiV1(`/builder/files?projectId=${projectId}`), {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await response.json();
      if (data.files) {
        setFiles(data.files.filter((f: { isFolder?: boolean }) => !f.isFolder));
      }
    } catch (error) {
      console.error("Failed to load files:", error);
    }
  }, [projectId, sessionToken]);

  const loadProject = useCallback(async (silent = false) => {
    if (!sessionToken || !projectId) return;

    if (!silent) setLoading(true);
    try {
      const response = await fetch(apiV1(`/builder/projects?projectId=${projectId}`), {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({})) as { error?: string };
        if (!silent) toast.error(errBody.error ?? "Failed to load project");
        return "error";
      }

      const data = (await response.json()) as {
        project: {
          name: string;
          framework: string;
          status: string;
          previewUrl?: string | null;
          [key: string]: unknown;
        };
      };
      setProject(data.project);

      const url = data.project?.previewUrl ?? null;
      setPreviewUrl(url);
      setPreviewRunning(!!url);

      await loadProfile();
      await loadFiles();
      return data.project.status as string;
    } catch (error) {
      if (!silent) {
        console.error("Failed to load project:", error);
        toast.error("Could not reach the server. Check your connection and try again.");
      }
      reportCrash(error, { extra: { projectId, context: "loadProject" } });
      return "error";
    } finally {
      if (!silent) setLoading(false);
    }
  }, [sessionToken, projectId, loadProfile, loadFiles]);

  const updateProject = useCallback(
    async (params: {
      name?: string;
      description?: string | null;
      founderName?: string | null;
      whyBuilt?: string | null;
      linkedAssets?: Array<{ type: string; url: string; label?: string }>;
      tractionSignals?: Array<{ type: string; description: string; createdAt: string }>;
      recentActivity?: Array<{ type: string; description: string; createdAt: string }>;
      progressScore?: number;
    }) => {
      if (!sessionToken || !projectId) return;
      try {
        const response = await fetch(apiV1("/builder/projects"), {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ projectId, ...params }),
        });
        if (!response.ok) throw new Error("Update failed");
        await loadProject(true);
      } catch (err) {
        console.error("Failed to update project:", err);
        toast.error("Failed to update project");
        throw err;
      }
    },
    [sessionToken, projectId, loadProject]
  );

  const loadBuilderProjects = useCallback(async () => {
    if (!sessionToken) return;
    setProjectsLoading(true);
    try {
      const response = await fetch(apiV1("/builder/projects"), {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await response.json();
      if (data.projects) {
        setBuilderProjects(
          data.projects.map((p: { id: string; name: string; framework: string; status: string }) => ({
            id: p.id,
            name: p.name,
            framework: p.framework,
            status: p.status,
          }))
        );
      }
    } catch (error) {
      console.error("Failed to load builder projects:", error);
    } finally {
      setProjectsLoading(false);
    }
  }, [sessionToken]);

  useLayoutEffect(() => {
    const target =
      !chatCollapsed && leftPanelTab === "chat"
        ? sidebarSlotRef.current
        : chatCollapsed && voiceSheetOpen
          ? sheetSlotRef.current
          : hiddenSlotRef.current;
    setPortalTarget(target);
  }, [chatCollapsed, leftPanelTab, voiceSheetOpen]);

  // Ensure portal target is set once the sidebar slot is mounted (ref can be set after first layout)
  useEffect(() => {
    if (!chatCollapsed && leftPanelTab === "chat" && sidebarSlotRef.current && !portalTarget) {
      setPortalTarget(sidebarSlotRef.current);
    }
  }, [chatCollapsed, leftPanelTab, portalTarget]);

  useEffect(() => {
    if (!authLoading && !user) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("authReturnUrl", `/builder/build/${projectId}`);
      }
      router.push("/builder");
      return;
    }

    if (user && projectId) {
      void loadProject();
    }
  }, [user, projectId, authLoading, loadProject]);

  // When we land with status scaffolding, start the scaffold request (build page runs it)
  useEffect(() => {
    if (!project || project.status !== "scaffolding" || !sessionToken || !projectId || scaffoldStartedRef.current) return;
    scaffoldStartedRef.current = true;
    const description = typeof window !== "undefined" ? sessionStorage.getItem("builder_prompt") ?? "" : "";
    fetch(apiV1("/builder/scaffold"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ projectId, description }),
    }).catch(() => {
      scaffoldStartedRef.current = false;
    });
  }, [project?.status, projectId, sessionToken]);

  // Poll project when preview is not running so we pick up server start (e.g. from another tab or after refresh)
  useEffect(() => {
    if (!projectId || !sessionToken || previewRunning || project?.status === "scaffolding") return;
    const interval = setInterval(() => {
      void loadProject(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [projectId, sessionToken, previewRunning, project?.status, loadProject]);

  // Poll preview errors when preview is running so we can show "Fix now"
  useEffect(() => {
    if (!projectId || !sessionToken || !previewRunning) return;
    const fetchErrors = async () => {
      try {
        const response = await fetch(apiV1(`/builder/preview/errors?projectId=${encodeURIComponent(projectId)}`), {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        if (!response.ok) return;
        const data = (await response.json()) as { output?: string; hasErrors?: boolean };
        if (data.hasErrors && data.output?.trim()) setPreviewError(data.output.trim());
      } catch {
        /* ignore */
      }
    };
    void fetchErrors();
    const interval = setInterval(fetchErrors, 5000);
    return () => clearInterval(interval);
  }, [projectId, sessionToken, previewRunning]);

  const handleFixNow = useCallback(() => {
    if (!previewError) return;
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").trim();
    const cleanOutput = stripAnsi(previewError).slice(0, 6000);
    const message = `Fix this build error. You MUST output a line RUN_COMMAND: <command> to install missing packages. Use pnpm (e.g. RUN_COMMAND: pnpm dlx shadcn@latest add button card for missing @/components/ui/button or ui/card). Then use FILE_PLAN for any code changes.\n\nBuild output:\n${cleanOutput}`;
    setTriggerSendPrompt(message);
    setChatCollapsed(false);
    setLeftPanelTab("chat");
    setPreviewError(null);
  }, [previewError]);

  const handleStartPreview = async () => {
    if (!sessionToken || !projectId) return;

    try {
      toast.info("Starting preview server...");
      
      const response = await fetch(apiV1("/builder/preview/start"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ projectId }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg = (errBody as { error?: string }).error ?? "Failed to start preview";
        throw new Error(msg);
      }

      await response.json();
      await loadProject(true);
      toast.success("Preview server started!");
    } catch (error) {
      console.error("Failed to start preview:", error);
      const message = error instanceof Error ? error.message : "Failed to start preview server";
      toast.error(message);
    }
  };

  const handleCodeAction = async (action: { type: string; path: string; content?: string }) => {
    if (!sessionToken || !projectId) return;
    if ((action.type === "create" || action.type === "update") && (action.content == null || action.content.trim() === "")) {
      console.warn("[builder] Skipping apply: create/update action has no content", action.path);
      toast.error("No code was generated for this change. Try asking again.");
      return;
    }

    try {
      const response = await fetch(apiV1("/builder/files"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          projectId,
          action: action.type,
          path: action.path,
          content: action.content,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update file");
      }

      await loadFiles();
      toast.success(`File ${action.type === "create" ? "created" : action.type === "update" ? "updated" : "deleted"} successfully`);
    } catch (error) {
      console.error("Failed to handle code action:", error);
      toast.error("Failed to update file");
    }
  };

  const handleExportZip = useCallback(async () => {
    const fileList = files.filter((f): f is { path: string; content: string } => !f.isFolder && typeof f.content === "string");
    if (fileList.length === 0) {
      toast.error("No files to export");
      return;
    }
    try {
      const zip = new JSZip();
      for (const f of fileList) {
        zip.file(f.path, f.content ?? "");
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.name ?? "project"}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Project exported as ZIP");
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export project");
    }
  }, [files, project?.name]);

  const handleReward = useCallback((amount: number, newBalance: number) => {
    setPineappleBalance(newBalance);
    if (amount > 0) {
      toast.success(`+${amount} 🍍 earned! Balance: ${newBalance}`);
    }
  }, []);

  /** When scaffold completes, notify the agent and send the builder prompt so it generates and applies code. */
  const sendBuilderPromptToAgent = useCallback(async (): Promise<void> => {
    if (builderPromptSentRef.current) return;
    const savedPrompt =
      typeof window !== "undefined" ? sessionStorage.getItem("builder_prompt") ?? "" : "";
    if (!savedPrompt.trim() || !sessionToken || !projectId) return;

    builderPromptSentRef.current = true;
    sessionStorage.removeItem("builder_prompt");

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      };

      let threadId: string;
      const threadRes = await fetch(apiV1("/thread"), { method: "POST", headers });
      const threadData = await threadRes.json();
      if (threadData.threadId) {
        threadId = threadData.threadId;
        try {
          sessionStorage.setItem(`builder_thread_${projectId}`, threadId);
        } catch {
          /* ignore */
        }
      } else {
        console.error("Failed to create thread for builder prompt", threadRes.status, threadData);
        toast.error("Could not start agent. You can paste your idea in the chat.");
        return;
      }

      let filesContext: Array<{ path: string; content: string }> = [];
      try {
        const filesRes = await fetch(apiV1(`/builder/files?projectId=${projectId}`), { headers });
        const filesData = await filesRes.json();
        if (filesData.files) {
          filesContext = filesData.files
            .filter((f: { isFolder?: boolean }) => !f.isFolder)
            .map((f: { path: string; content?: string }) => ({
              path: f.path,
              content: f.content ?? "",
            }));
        }
      } catch (err) {
        console.error("Failed to fetch files for chat context:", err);
      }

      const idempotencyKey =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `builder-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const promptToSend =
        "Scaffolding is complete. The project structure is in context. Implement the following:\n\n" +
        savedPrompt.trim();

      const chatRes = await fetch(apiV1("/chat"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          threadId,
          prompt: promptToSend,
          ...(chatModelId ? { model: chatModelId } : {}),
          projectId,
          idempotencyKey,
          context: {
            projectFiles: filesContext,
            projectId,
          },
        }),
      });

      const chatData = (await chatRes.json()) as {
        message?: string;
        codeActions?: Array<{ type: string; path: string; content?: string; description: string }>;
        appliedFiles?: Array<{ path: string; action: string }>;
        pineapplesEarned?: number;
        newBalance?: number;
      };

      const earned = chatData.pineapplesEarned ?? 0;
      const newBalance = chatData.newBalance ?? 0;
      if (earned > 0) {
        handleReward(earned, newBalance);
      }

      if (chatData.codeActions?.length) {
        for (const action of chatData.codeActions) {
          await handleCodeAction(action);
        }
      }
      if (chatData.appliedFiles?.length) {
        await loadFiles();
      }

      const storageKey = `builder_chat_${projectId}`;
      try {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
        const existing: Array<{ id: string; role: string; content: string; timestamp: number; codeActions?: unknown }> = raw
          ? (() => {
              try {
                const parsed = JSON.parse(raw) as unknown;
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })()
          : [];
        const userMsg = {
          id: `user-${Date.now()}`,
          role: "user",
          content: savedPrompt.trim(),
          timestamp: Date.now(),
        };
        const assistantMsg = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: chatData.message ?? "Done.",
          timestamp: Date.now(),
          codeActions: chatData.codeActions,
        };
        window.localStorage.setItem(
          storageKey,
          JSON.stringify([...existing, userMsg, assistantMsg])
        );
        setChatReloadKey((k) => k + 1);
      } catch {
        /* ignore */
      }

      setLeftPanelTab("chat");
      toast.success("Agent is building your app from your idea.");
    } catch (error) {
      console.error("Failed to send builder prompt to agent:", error);
      toast.error("Could not send your idea to the agent. Open the Builder Chat tab and paste it there.");
      builderPromptSentRef.current = false;
    }
  }, [
    sessionToken,
    projectId,
    chatModelId,
    handleCodeAction,
    handleReward,
    setLeftPanelTab,
    loadFiles,
  ]);

  // Poll while scaffolding until ready or error; when ready, load files and send builder prompt to agent
  useEffect(() => {
    if (!project || project.status !== "scaffolding") return;
    const interval = setInterval(async () => {
      const status = await loadProject(true);
      if (status === "ready" || status === "error") {
        clearInterval(interval);
        if (status === "ready") {
          void loadFiles();
          void sendBuilderPromptToAgent();
        }
        if (status === "error") {
          toast.error("Project setup failed. You can try again from the builder.");
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [project?.status, projectId, loadProject, loadFiles, sendBuilderPromptToAgent]);

  const handleNewProject = useCallback(async () => {
    if (!sessionToken) {
      router.push("/builder");
      return;
    }
    try {
      const response = await fetch(apiV1("/builder/projects"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ name: "Untitled project", framework: "nextjs" }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create project");
      }
      const data = await response.json();
      const newId = data.project?.id;
      if (newId) {
        router.push(`/builder/build/${newId}`);
      } else {
        router.push("/builder");
      }
    } catch (error) {
      console.error("Create project error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create project");
      router.push("/builder");
    }
  }, [sessionToken, router]);

  const handleConfirmDeleteProject = useCallback(async () => {
    if (!deleteProjectId || !sessionToken) return;
    setDeletingProject(true);
    try {
      const response = await fetch(apiV1("/builder/projects"), {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ projectId: deleteProjectId }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to delete project");
      }
      toast.success("Project deleted");
      const wasCurrent = deleteProjectId === projectId;
      setDeleteProjectId(null);
      await loadBuilderProjects();
      if (wasCurrent) {
        router.push("/builder/projects");
      }
    } catch (error) {
      console.error("Delete project error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete project");
    } finally {
      setDeletingProject(false);
    }
  }, [deleteProjectId, sessionToken, projectId, loadBuilderProjects, router]);

  const isViewOnlyCollaborator =
    project?.projectRole === "collaborator" && project?.collaboratorPermission === "view";

  const handleClone = useCallback(async () => {
    if (!sessionToken || !projectId || cloningProject) return;
    setCloningProject(true);
    try {
      const response = await fetch(apiV1(`/builder/projects/${projectId}/clone`), {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = (await response.json()) as { project?: { id: string }; error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Failed to clone project");
        return;
      }
      const newId = data.project?.id;
      if (newId) {
        toast.success("Project cloned. You now own a copy.");
        router.push(`/builder/build/${newId}`);
      }
    } catch {
      toast.error("Failed to clone project");
    } finally {
      setCloningProject(false);
    }
  }, [sessionToken, projectId, cloningProject, router]);

  const handleSaveName = useCallback(async () => {
    const trimmed = editingNameValue.trim();
    if (!trimmed || !sessionToken || !projectId || trimmed === project?.name) {
      setIsEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await updateProject({ name: trimmed });
      toast.success("Project renamed");
    } catch {
      toast.error("Failed to rename project");
    } finally {
      setSavingName(false);
      setIsEditingName(false);
    }
  }, [editingNameValue, sessionToken, projectId, project?.name, updateProject]);

  const handleListForSale = useCallback(async () => {
    if (!sessionToken || !projectId || listingForSale) return;
    setListingForSale(true);
    try {
      const response = await fetch(apiV1(`/builder/projects/${projectId}/list-for-sale`), {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Failed to list project");
        return;
      }
      toast.success("Project listed on marketplace!");
      await loadProject(true);
    } catch {
      toast.error("Failed to list project for sale");
    } finally {
      setListingForSale(false);
    }
  }, [sessionToken, projectId, listingForSale, loadProject]);

  const handleGetInstantOffer = useCallback(async () => {
    if (!sessionToken || !projectId || offerLoading) return;
    setOfferLoading(true);
    setOfferDialogOpen(true);
    try {
      const response = await fetch(apiV1(`/builder/projects/${projectId}/offer`), {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = (await response.json()) as {
        offerLow?: number;
        offerHigh?: number;
        reasoning?: string;
        signals?: { strengths?: string[]; risks?: string[] };
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Failed to generate offer");
        setOfferDialogOpen(false);
        return;
      }
      setOfferData({
        offerLow: data.offerLow ?? 0,
        offerHigh: data.offerHigh ?? 0,
        reasoning: data.reasoning ?? "",
        signals: {
          strengths: data.signals?.strengths ?? [],
          risks: data.signals?.risks ?? [],
        },
      });
    } catch {
      toast.error("Failed to generate instant offer");
      setOfferDialogOpen(false);
    } finally {
      setOfferLoading(false);
    }
  }, [sessionToken, projectId, offerLoading]);

  if (authLoading || loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-6 bg-background" aria-busy="true" aria-live="polite">
        <div className="relative flex items-center justify-center">
          <img
            src="/logo.png"
            alt=""
            className="h-16 w-auto object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const next = e.currentTarget.nextElementSibling;
              if (next) (next as HTMLElement).style.display = "flex";
            }}
          />
          <div className="hidden h-16 w-16 items-center justify-center rounded-xl bg-primary/10 text-2xl font-bold text-primary" aria-hidden>
            V
          </div>
        </div>
        <p className="text-muted-foreground text-sm">Loading</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-muted-foreground">Project not found</div>
          <Button onClick={() => router.push("/builder")}>Back to Builder</Button>
        </div>
      </div>
    );
  }

  if (viewMode === "code") {
    return (
      <div className="h-screen w-screen flex flex-col bg-background">
        <BuilderCodeView
          files={files}
          onBack={() => setViewMode("main")}
          projectName={project.name}
          projectId={projectId}
          sessionToken={sessionToken}
          onFilesChange={() => void loadFiles()}
        />
      </div>
    );
  }

  const chatPanelWidth = 440;

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      <header className="border-b px-3 py-2 flex items-center justify-between shrink-0 bg-background/95 backdrop-blur-sm gap-2">
        {/* Left: back, project logo, editable project name */}
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push("/builder")} aria-label="Back to builder">
            <ChevronLeft className="h-5 w-5" />
          </Button>

          {/* Project logo — clickable to open logo modal */}
          <button
            type="button"
            onClick={() => setLogoModalOpen(true)}
            className="shrink-0 group relative rounded-md overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Change project logo"
            title="Change project logo"
          >
            {project.logoUrl ? (
              <img
                src={project.logoUrl}
                alt={`${project.name} logo`}
                className="h-7 w-7 rounded-md object-cover"
              />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary select-none">
                {project.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md" aria-hidden>
              <Pencil className="h-3 w-3 text-white" />
            </span>
          </button>

          {/* Editable project name */}
          {isEditingName ? (
            <form
              className="flex items-center gap-1 min-w-0"
              onSubmit={(e) => { e.preventDefault(); void handleSaveName(); }}
            >
              <Input
                value={editingNameValue}
                onChange={(e) => setEditingNameValue(e.target.value)}
                onBlur={() => void handleSaveName()}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsEditingName(false);
                    setEditingNameValue(project.name);
                  }
                }}
                className="h-7 text-sm font-semibold w-[160px] sm:w-[220px] px-2"
                autoFocus
                aria-label="Edit project name"
                disabled={savingName}
              />
              <Button type="submit" size="icon" variant="ghost" className="h-7 w-7 shrink-0" disabled={savingName} aria-label="Save name">
                {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-primary" />}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => { setIsEditingName(false); setEditingNameValue(project.name); }}
                aria-label="Cancel rename"
              >
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            </form>
          ) : (
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (!isViewOnlyCollaborator) {
                    setEditingNameValue(project.name);
                    setIsEditingName(true);
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 group rounded px-1 -ml-1 min-w-0",
                  !isViewOnlyCollaborator && "hover:bg-muted cursor-text"
                )}
                title={isViewOnlyCollaborator ? project.name : "Click to rename"}
                aria-label={isViewOnlyCollaborator ? project.name : `Rename project: ${project.name}`}
              >
                <h1 className="text-sm font-semibold truncate max-w-[140px] sm:max-w-[240px]">
                  {project.name}
                </h1>
                {!isViewOnlyCollaborator && (
                  <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
                )}
              </button>
              <p className="text-[10px] text-muted-foreground px-1 -mt-0.5">
                {project.framework} · {project.status}
              </p>
            </div>
          )}
        </div>

        {/* Right: Wallet, Clone (if view-only), Code, Preview, Kebab, Refresh, Panel toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Wallet / pineapple balance */}
          {pineappleBalance !== null && (
            <button
              type="button"
              onClick={() => router.push("/wallet")}
              className="flex items-center gap-1 rounded border bg-muted/50 px-2 py-0.5 text-xs font-medium hover:bg-muted transition-colors"
              aria-label={`Pineapple balance: ${pineappleBalance}. Go to wallet`}
              title="Go to wallet"
            >
              <Wallet className="h-3 w-3 text-muted-foreground" aria-hidden />
              <span aria-hidden>🍍</span>
              <span>{pineappleBalance}</span>
            </button>
          )}

          {isViewOnlyCollaborator && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleClone()}
              disabled={cloningProject}
              className="gap-1.5 h-8"
              aria-label="Clone project to edit your own copy"
            >
              {cloningProject ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              <span className="hidden sm:inline text-xs">Clone</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode("code")}
            className="gap-1.5 h-8"
            aria-label="View code"
          >
            <FileCode className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline text-xs">Code</span>
          </Button>

          {previewRunning && previewUrl ? (
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => window.open(previewUrl, "_blank")}>
              <Play className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline text-xs">Preview</span>
            </Button>
          ) : (
            <Button size="sm" className="gap-1.5 h-8" onClick={handleStartPreview}>
              <Play className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline text-xs">Start Preview</span>
            </Button>
          )}

          {/* Kebab dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More options">
                <MoreVertical className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleExportZip}>
                <Download className="mr-2 h-4 w-4" aria-hidden />
                Export ZIP
              </DropdownMenuItem>
              {!isViewOnlyCollaborator && project?.status !== "listed" && (
                <DropdownMenuItem
                  onClick={() => void handleListForSale()}
                  disabled={listingForSale || (project?.progressScore ?? 0) < 20}
                  title={(project?.progressScore ?? 0) < 20 ? "Reach 20% progress to list for sale" : undefined}
                >
                  {listingForSale ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ShoppingBag className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  List for Sale
                  {(project?.progressScore ?? 0) < 20 && (
                    <Badge variant="secondary" className="ml-auto text-[10px]">20% req.</Badge>
                  )}
                </DropdownMenuItem>
              )}
              {!isViewOnlyCollaborator && (
                <DropdownMenuItem
                  onClick={() => void handleGetInstantOffer()}
                  disabled={offerLoading || (project?.progressScore ?? 0) < 10}
                  title={(project?.progressScore ?? 0) < 10 ? "Reach 10% progress to get an offer" : undefined}
                >
                  <Zap className="mr-2 h-4 w-4" aria-hidden />
                  Get Vamo Offer
                  {(project?.progressScore ?? 0) < 10 && (
                    <Badge variant="secondary" className="ml-auto text-[10px]">10% req.</Badge>
                  )}
                </DropdownMenuItem>
              )}
              {project?.status === "listed" && (
                <DropdownMenuItem disabled>
                  <ShoppingBag className="mr-2 h-4 w-4" aria-hidden />
                  <span className="text-muted-foreground">Listed on Marketplace</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/builder/projects")}>
                <FolderOpen className="mr-2 h-4 w-4" aria-hidden />
                My Projects
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/marketplace")}>
                <ShoppingBag className="mr-2 h-4 w-4" aria-hidden />
                Marketplace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIntegrationsOpen(true)}>
                <Plug className="mr-2 h-4 w-4" aria-hidden />
                Integrations
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => loadProject()} aria-label="Refresh project">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hidden lg:inline-flex"
            onClick={() => setChatCollapsed((c) => !c)}
            aria-label={chatCollapsed ? "Expand chat" : "Collapse chat"}
            title={chatCollapsed ? "Expand chat" : "Collapse chat"}
          >
            {chatCollapsed ? (
              <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <PanelRightClose className="h-3.5 w-3.5" aria-hidden />
            )}
          </Button>
        </div>
      </header>

      {/* Integrations dialog */}
      <IntegrationsDialog
        open={integrationsOpen}
        onOpenChange={setIntegrationsOpen}
        projectId={projectId}
        projectName={project.name}
        sessionToken={sessionToken ?? ""}
      />

      {/* Project logo modal */}
      <ProjectLogoModal
        open={logoModalOpen}
        onOpenChange={setLogoModalOpen}
        projectId={projectId}
        projectName={project.name}
        currentLogoUrl={project.logoUrl ?? null}
        sessionToken={sessionToken ?? ""}
        onLogoUpdated={(url) => setProject((prev) => prev ? { ...prev, logoUrl: url } : prev)}
      />

      <div className="flex-1 flex min-h-0">
        {/* Left: Builder Chat or Projects (always in DOM for portal slot when expanded) */}
        <aside
          className={cn(
            "hidden lg:flex flex-col border-r shrink-0 bg-background transition-[width] duration-200",
            chatCollapsed && "w-0 min-w-0 overflow-hidden border-0"
          )}
          style={!chatCollapsed ? { width: chatPanelWidth } : undefined}
          aria-label="Builder chat and projects"
        >
          {!chatCollapsed && (
            <>
              <Tabs value={leftPanelTab} onValueChange={(v) => setLeftPanelTab(v as "chat" | "projects")} className="flex-1 flex flex-col min-h-0">
                <TabsList className="w-full shrink-0 rounded-none border-b bg-muted/50 h-10">
                  <TabsTrigger value="chat" className="flex-1 gap-2" aria-label="Builder chat">
                    <MessageSquare className="h-4 w-4" />
                    Builder Chat
                  </TabsTrigger>
                  <TabsTrigger value="projects" className="flex-1 gap-2" aria-label="Projects">
                    <FolderOpen className="h-4 w-4" />
                    Projects
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="chat" forceMount className="flex-1 min-h-0 m-0 overflow-hidden data-[state=inactive]:hidden flex flex-col">
                  <div
                    ref={sidebarSlotRef}
                    className="h-full min-h-[280px] flex flex-col overflow-hidden bg-background"
                    aria-label="Builder chat content"
                  />
                </TabsContent>
                <TabsContent value="projects" className="flex-1 min-h-0 m-0 overflow-auto data-[state=inactive]:hidden">
                  <BuilderProjectsList
                    projects={builderProjects}
                    loading={projectsLoading}
                    currentProjectId={projectId}
                    onLoad={loadBuilderProjects}
                    onSelect={(id) => router.push(`/builder/build/${id}`)}
                    onNewProject={handleNewProject}
                    onDelete={(id) => setDeleteProjectId(id)}
                  />
                </TabsContent>
              </Tabs>
            </>
          )}
        </aside>

        {/* Center: Preview and Business Analytics (tabbed) */}
        <section className="flex-1 flex flex-col min-w-0" aria-label="Preview and Business Analytics">
          <Tabs value={centerTab} onValueChange={(v) => setCenterTab(v as "preview" | "business")} className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-full shrink-0 rounded-none border-b bg-muted/50 h-11 grid grid-cols-2">
              <TabsTrigger value="preview" className="gap-2 text-sm font-medium" aria-label="Preview">
                <Play className="h-4 w-4 shrink-0" aria-hidden />
                Preview
              </TabsTrigger>
              <TabsTrigger value="business" className="gap-2 text-sm font-medium" aria-label="Business Analytics">
                <BarChart3 className="h-4 w-4 shrink-0" aria-hidden />
                Business Analytics
              </TabsTrigger>
            </TabsList>
            <TabsContent value="preview" className="flex-1 flex flex-col min-h-0 m-0 data-[state=inactive]:hidden">
              <div className="border-b px-3 py-1.5 bg-muted/30 shrink-0 flex items-center justify-between gap-2">
                <h2 className="text-xs font-medium text-muted-foreground">Preview</h2>
                {previewRunning && previewUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => window.open(previewUrl ?? undefined, "_blank", "noopener,noreferrer")}
                    aria-label="Open preview in new tab"
                  >
                    Open in new tab
                  </Button>
                )}
              </div>
              {previewError && (
                <div className="shrink-0 border-b bg-destructive/10 px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-destructive">Build error detected</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5" title={previewError}>
                      {previewError.slice(0, 120)}
                      {previewError.length > 120 ? "…" : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="default" className="gap-1.5 shrink-0" onClick={handleFixNow}>
                    <Wrench className="h-4 w-4" aria-hidden />
                    Fix now
                  </Button>
                </div>
              )}
              <div className="flex-1 relative bg-muted">
                {project.status === "scaffolding" ? (
                  <div className="flex flex-col items-center justify-center h-full gap-6" aria-live="polite" aria-busy="true">
                    <div className="relative">
                      <Loader2 className="h-14 w-14 animate-spin text-primary" aria-hidden />
                      <div className="absolute inset-0 h-14 w-14 rounded-full border-2 border-primary/30 border-t-primary animate-spin" aria-hidden />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="font-medium text-foreground">Setting up your project</p>
                      <p className="text-sm text-muted-foreground">This may take a minute. You can use chat and analytics while you wait.</p>
                    </div>
                  </div>
                ) : previewRunning && previewUrl ? (
                  <iframe
                    src={previewUrl}
                    className="w-full h-full border-0"
                    title="App Preview"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                  />
                ) : project.status === "error" ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <Code className="h-12 w-12 text-muted-foreground" aria-hidden />
                    <p className="text-muted-foreground text-sm">Project setup failed.</p>
                    <Button variant="outline" size="sm" onClick={() => router.push("/builder")}>
                      Back to Builder
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center space-y-4">
                      <Code className="h-12 w-12 mx-auto text-muted-foreground" aria-hidden />
                      <p className="text-muted-foreground text-sm">No preview available</p>
                      <Button onClick={handleStartPreview} size="sm">
                        <Play className="h-4 w-4 mr-2" />
                        Start Preview Server
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="business" className="flex-1 flex flex-col min-h-0 m-0 data-[state=inactive]:hidden">
              <BusinessPanel
                projectId={projectId}
                projectName={project.name}
                description={project?.description ?? null}
                progressScore={project?.progressScore ?? 0}
                tractionSignals={project?.tractionSignals ?? []}
                recentActivity={project?.recentActivity ?? []}
                linkedAssets={project?.linkedAssets ?? []}
                founderName={project?.founderName ?? null}
                whyBuilt={project?.whyBuilt ?? null}
                valuationLow={project?.valuationLow ?? null}
                valuationHigh={project?.valuationHigh ?? null}
                projectPineapples={(project?.recentActivity ?? []).filter((a) => a.type === "reward_earned").length}
                variant="full"
                sessionToken={sessionToken}
                onUpdateProject={isViewOnlyCollaborator ? undefined : updateProject}
              />
            </TabsContent>
          </Tabs>
        </section>
      </div>

      {/* Single CallPanel instance: portaled to sidebar, sheet, or hidden so call state persists */}
      {portalTarget &&
        createPortal(
          <CallPanel
            onStart={() => {}}
            onEnd={() => setVoiceSheetOpen(false)}
            isActive={false}
            onCodeAction={handleCodeAction}
            currentFile={currentFile ?? undefined}
            projectFiles={files.map((f) => ({ path: f.path, content: f.content ?? "" }))}
            selectedCode={undefined}
            projectId={projectId}
            userId={user?.id ?? undefined}
            isPlaygroundProject={false}
            chatModelId={chatModelId}
            sessionToken={sessionToken}
            onReward={handleReward}
            autoApplyCodeActions
            triggerSendPrompt={triggerSendPrompt}
            onTriggerSendComplete={() => setTriggerSendPrompt(null)}
            reloadMessagesKey={chatReloadKey}
            onFilesApplied={loadFiles}
            builderViewOnly={isViewOnlyCollaborator}
          />,
          portalTarget
        )}

      {/* Hidden slot to keep CallPanel mounted when sidebar collapsed and sheet closed */}
      <div ref={hiddenSlotRef} className="hidden" aria-hidden />

      <Dialog open={!!deleteProjectId} onOpenChange={(open) => !open && setDeleteProjectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This will remove the project and its files. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProjectId(null)} disabled={deletingProject}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDeleteProject} disabled={deletingProject}>
              {deletingProject ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating voice orb: mobile always; desktop when sidebar collapsed (bottom-right) */}
      <Sheet open={voiceSheetOpen} onOpenChange={setVoiceSheetOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className={cn(
              "fixed bottom-6 left-1/2 z-50 h-14 w-14 -translate-x-1/2 rounded-full overflow-hidden border-0 cursor-pointer bg-transparent shadow-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
              "lg:left-auto lg:right-6 lg:translate-x-0",
              !chatCollapsed && "lg:hidden"
            )}
            aria-label="Open voice and chat"
          >
            <span className="block h-full w-full rounded-full overflow-hidden">
              <BuilderOrb hoverIntensity={0.5} rotateOnHover />
            </span>
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full max-w-md p-0 flex flex-col">
          <div className="p-3 border-b shrink-0">
            <h2 className="text-sm font-semibold">Voice & Chat</h2>
            <p className="text-xs text-muted-foreground">Start a voice conversation or use text chat</p>
          </div>
          <div ref={sheetSlotRef} className="flex-1 min-h-0 overflow-hidden" />
        </SheetContent>
      </Sheet>
      {/* Instant Offer Dialog */}
      <Dialog open={offerDialogOpen} onOpenChange={(open) => { if (!offerLoading) setOfferDialogOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" aria-hidden />
              Vamo Instant Offer
            </DialogTitle>
            <DialogDescription>
              AI-powered acquisition valuation for <strong>{project?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          {offerLoading && (
            <div className="flex flex-col items-center gap-4 py-8" aria-live="polite" aria-busy="true">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
              <p className="text-sm text-muted-foreground">Analyzing your project…</p>
            </div>
          )}

          {!offerLoading && offerData && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Estimated acquisition range</p>
                <p className="text-3xl font-bold tracking-tight">
                  ${offerData.offerLow.toLocaleString()}
                  <span className="text-muted-foreground mx-2">–</span>
                  ${offerData.offerHigh.toLocaleString()}
                </p>
                <Badge variant="secondary" className="mt-2">
                  Progress: {project?.progressScore ?? 0}%
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground">{offerData.reasoning}</p>

              {offerData.signals.strengths.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-green-600 mb-2 flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                    Strengths
                  </h4>
                  <ul className="space-y-1">
                    {offerData.signals.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" aria-hidden />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {offerData.signals.risks.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-red-500 mb-2 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                    Risks
                  </h4>
                  <ul className="space-y-1">
                    {offerData.signals.risks.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" aria-hidden />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferDialogOpen(false)} disabled={offerLoading}>
              Close
            </Button>
            {!offerLoading && offerData && project?.status !== "listed" && (
              <Button
                onClick={() => { setOfferDialogOpen(false); void handleListForSale(); }}
                disabled={(project?.progressScore ?? 0) < 20}
              >
                <ShoppingBag className="mr-2 h-4 w-4" aria-hidden />
                List for Sale
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


