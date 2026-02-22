"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Terminal, X, Loader2 } from "lucide-react";
import { ProjectSidebar, CodeEditor, TabsBar } from "@/components/ide";
import { apiV1 } from "@/lib/api";
import type { ProjectFile } from "@/lib/projects";
import { toast } from "sonner";

export type BuilderCodeFile = { path: string; content?: string; isFolder?: boolean };

type BuilderCodeViewProps = {
  files: BuilderCodeFile[];
  onBack: () => void;
  projectName?: string;
  projectId: string;
  sessionToken: string | null;
  onFilesChange: () => void;
};

function toProjectFiles(files: BuilderCodeFile[]): ProjectFile[] {
  return files
    .filter((f) => !f.isFolder)
    .map((f) => ({ path: f.path, content: f.content ?? "" }));
}

export function BuilderCodeView({
  files,
  onBack,
  projectName = "Project",
  projectId,
  sessionToken,
  onFilesChange,
}: BuilderCodeViewProps) {
  const projectFiles = useMemo(() => toProjectFiles(files), [files]);
  const fileMap = useMemo(() => {
    const map = new Map<string, string>();
    projectFiles.forEach((f) => map.set(f.path, f.content));
    return map;
  }, [projectFiles]);

  const [openTabs, setOpenTabs] = useState<string[]>(() => (projectFiles[0] ? [projectFiles[0].path] : []));
  const [activePath, setActivePath] = useState<string | null>(() => projectFiles[0]?.path ?? null);
  const [dirtyFiles, setDirtyFiles] = useState<string[]>([]);
  const [dirtyContent, setDirtyContent] = useState<Map<string, string>>(new Map());
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalLines, setTerminalLines] = useState<Array<{ type: "cmd" | "stdout" | "stderr"; text: string }>>([]);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalRunning, setTerminalRunning] = useState(false);
  const terminalOutputRef = useRef<HTMLDivElement>(null);

  const getContent = useCallback(
    (path: string): string => {
      return dirtyContent.get(path) ?? fileMap.get(path) ?? "";
    },
    [fileMap, dirtyContent]
  );

  const activeContent = activePath ? getContent(activePath) : "";

  const callFilesApi = useCallback(
    async (action: "create" | "update" | "delete", path: string, content?: string) => {
      if (!sessionToken) {
        toast.error("Session expired. Please sign in again.");
        return;
      }
      const response = await fetch(apiV1("/builder/files"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ projectId, action, path, content }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg = (err as { error?: string }).error ?? "Request failed";
        if (response.status === 404 && msg.toLowerCase().includes("project")) {
          throw new Error("Project not found. Try refreshing the page or reopening the project.");
        }
        throw new Error(msg);
      }
    },
    [projectId, sessionToken]
  );

  const handleSelectFile = useCallback((path: string) => {
    setActivePath(path);
    setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
  }, []);

  const handleCloseTab = useCallback(
    (path: string) => {
      const remaining = openTabs.filter((p) => p !== path);
      setOpenTabs(remaining);
      setDirtyFiles((prev) => prev.filter((p) => p !== path));
      setDirtyContent((prev) => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
      if (activePath === path) {
        setActivePath(remaining[remaining.length - 1] ?? null);
      }
    },
    [activePath, openTabs]
  );

  const handleChangeCode = useCallback((path: string, code: string) => {
    setDirtyContent((prev) => {
      const next = new Map(prev);
      next.set(path, code);
      return next;
    });
    setDirtyFiles((prev) => (prev.includes(path) ? prev : [...prev, path]));
  }, []);

  const handleSave = useCallback(async () => {
    if (!activePath) return;
    const content = getContent(activePath);
    try {
      await callFilesApi("update", activePath, content);
      setDirtyFiles((prev) => prev.filter((p) => p !== activePath));
      setDirtyContent((prev) => {
        const next = new Map(prev);
        next.delete(activePath);
        return next;
      });
      onFilesChange();
      toast.success("File saved");
    } catch (error) {
      console.error("Save failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save file");
    }
  }, [activePath, getContent, callFilesApi, onFilesChange]);

  const handleCreateFile = useCallback(
    async (path: string) => {
      const trimmed = path.trim();
      if (!trimmed) return;
      try {
        await callFilesApi("create", trimmed, "");
        onFilesChange();
        toast.success("File created");
        handleSelectFile(trimmed);
      } catch (error) {
        console.error("Create file failed:", error);
        toast.error(error instanceof Error ? error.message : "Failed to create file");
      }
    },
    [callFilesApi, onFilesChange, handleSelectFile]
  );

  const handleCreateFolder = useCallback(
    async (path: string) => {
      const trimmed = path.trim();
      if (!trimmed) return;
      const keepPath = trimmed.endsWith("/") ? `${trimmed}.keep` : `${trimmed}/.keep`;
      try {
        await callFilesApi("create", keepPath, "");
        onFilesChange();
        toast.success("Folder created");
      } catch (error) {
        console.error("Create folder failed:", error);
        toast.error(error instanceof Error ? error.message : "Failed to create folder");
      }
    },
    [callFilesApi, onFilesChange]
  );

  const handleDeleteFile = useCallback(
    async (path: string) => {
      try {
        await callFilesApi("delete", path);
        handleCloseTab(path);
        onFilesChange();
        toast.success("Deleted");
      } catch (error) {
        console.error("Delete failed:", error);
        toast.error(error instanceof Error ? error.message : "Failed to delete");
      }
    },
    [callFilesApi, handleCloseTab, onFilesChange]
  );

  const handleRename = useCallback(
    async (oldPath: string, newPath: string, isFolder: boolean) => {
      if (oldPath === newPath) return;
      const content = isFolder ? "" : getContent(oldPath);
      try {
        if (isFolder) {
          const keepOld = oldPath.endsWith("/.keep") ? oldPath : `${oldPath}/.keep`;
          const keepNew = newPath.endsWith("/.keep") ? newPath : `${newPath}/.keep`;
          await callFilesApi("create", keepNew, "");
          await callFilesApi("delete", keepOld);
        } else {
          await callFilesApi("create", newPath, content);
          await callFilesApi("delete", oldPath);
          if (activePath === oldPath) {
            setActivePath(newPath);
            setOpenTabs((prev) => prev.map((p) => (p === oldPath ? newPath : p)));
            setDirtyContent((prev) => {
              const next = new Map(prev);
              if (next.has(oldPath)) {
                next.set(newPath, next.get(oldPath)!);
                next.delete(oldPath);
              }
              return next;
            });
            setDirtyFiles((prev) => prev.map((p) => (p === oldPath ? newPath : p)));
          }
        }
        onFilesChange();
        toast.success("Renamed");
      } catch (error) {
        console.error("Rename failed:", error);
        toast.error(error instanceof Error ? error.message : "Failed to rename");
      }
    },
    [callFilesApi, getContent, activePath, onFilesChange]
  );

  useEffect(() => {
    if (terminalOpen && terminalOutputRef.current) {
      terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
    }
  }, [terminalOpen, terminalLines]);

  const runTerminalCommand = useCallback(
    async (command: string) => {
      const cmd = command.trim();
      if (!cmd || !sessionToken) return;
      setTerminalLines((prev) => [...prev, { type: "cmd", text: `$ ${cmd}` }]);
      setTerminalInput("");
      setTerminalRunning(true);
      try {
        const response = await fetch(apiV1(`/builder/projects/${projectId}/run-command`), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ command: cmd }),
        });
        const data = (await response.json()) as { stdout?: string; stderr?: string; exitCode?: number; error?: string };
        if (!response.ok) {
          const err = (data as { error?: string }).error ?? `Request failed (HTTP ${response.status})`;
          setTerminalLines((prev) => [...prev, { type: "stderr", text: err }]);
          return;
        }
        if (typeof data.stdout === "string" && data.stdout.trim()) {
          setTerminalLines((prev) => [...prev, { type: "stdout", text: data.stdout!.trimEnd() }]);
        }
        if (typeof data.stderr === "string" && data.stderr.trim()) {
          setTerminalLines((prev) => [...prev, { type: "stderr", text: data.stderr!.trimEnd() }]);
        }
        if (typeof data.exitCode === "number" && data.exitCode !== 0) {
          setTerminalLines((prev) => [...prev, { type: "stderr", text: `(exit code ${data.exitCode})` }]);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Command failed";
        setTerminalLines((prev) => [
          ...prev,
          { type: "stderr", text: `Error: ${msg}` },
        ]);
      } finally {
        setTerminalRunning(false);
      }
    },
    [projectId, sessionToken]
  );

  const handleTerminalSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      runTerminalCommand(terminalInput);
    },
    [terminalInput, runTerminalCommand]
  );

  return (
    <div className="h-full flex flex-col bg-background">
      <header className="border-b px-4 py-3 flex items-center justify-between shrink-0 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2" aria-label="Back to builder">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <span className="text-sm text-muted-foreground">
            {projectName} — Code (editable)
          </span>
        </div>
        <Button
          variant={terminalOpen ? "secondary" : "outline"}
          size="sm"
          className="gap-2"
          onClick={() => setTerminalOpen((o) => !o)}
          aria-label={terminalOpen ? "Close terminal" : "Open terminal"}
          aria-pressed={terminalOpen}
        >
          <Terminal className="h-4 w-4" aria-hidden />
          Terminal
        </Button>
      </header>

      <div className="flex-1 flex min-h-0 flex-col">
        <div className="flex-1 flex min-h-0">
          <aside className="w-56 border-r flex flex-col shrink-0 bg-muted/30">
            <ProjectSidebar
              projectName={projectName}
              files={projectFiles}
              activePath={activePath ?? undefined}
              onSelectFile={handleSelectFile}
              onDeleteFile={handleDeleteFile}
              onCreateFile={handleCreateFile}
              onCreateFolder={handleCreateFolder}
              onRename={handleRename}
            />
          </aside>
          <div className="flex-1 flex flex-col min-w-0 border-r">
            <TabsBar
              paths={openTabs}
              activePath={activePath ?? undefined}
              dirtyFiles={dirtyFiles}
              onSelect={setActivePath}
              onClose={handleCloseTab}
            />
            <div className="flex-1 min-h-0">
              <CodeEditor
                path={activePath ?? undefined}
                value={activeContent}
                onChange={(code) => activePath && handleChangeCode(activePath, code)}
                onSave={handleSave}
              />
            </div>
          </div>
        </div>

        {terminalOpen && (
          <section
            className="border-t bg-muted/30 flex flex-col shrink-0"
            style={{ minHeight: 200, height: 280 }}
            aria-label="Terminal"
          >
            <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/50 shrink-0">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5" aria-hidden />
                Terminal
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setTerminalOpen(false)}
                aria-label="Close terminal"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
            <div
              ref={terminalOutputRef}
              className="flex-1 min-h-0 overflow-auto p-3 font-mono text-xs bg-background/80 border-b"
            >
              {terminalLines.length === 0 ? (
                <p className="text-muted-foreground">
                  Run whitelisted commands (e.g. pnpm list, pnpm dlx shadcn@latest add button). Type below and press Enter.
                </p>
              ) : (
                terminalLines.map((line, i) => (
                  <div
                    key={`${i}-${line.text.slice(0, 20)}`}
                    className={
                      line.type === "stderr"
                        ? "text-destructive whitespace-pre-wrap wrap-break-word"
                        : line.type === "cmd"
                          ? "text-foreground font-medium"
                          : "text-muted-foreground whitespace-pre-wrap wrap-break-word"
                    }
                  >
                    {line.text}
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handleTerminalSubmit} className="flex gap-2 p-2 shrink-0 bg-background">
              <span className="flex items-center text-muted-foreground font-mono text-xs">$</span>
              <Input
                type="text"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                placeholder="pnpm list, pnpm add ..., pnpm dlx shadcn@latest add button"
                className="font-mono text-sm flex-1 min-w-0 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                disabled={terminalRunning}
                aria-label="Terminal command"
              />
              <Button type="submit" size="sm" disabled={terminalRunning || !terminalInput.trim()}>
                {terminalRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  "Run"
                )}
              </Button>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
