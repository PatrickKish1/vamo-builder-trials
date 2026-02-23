"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Github,
  Globe,
  Plug,
  Loader2,
  Check,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  Server,
  Database,
} from "lucide-react";
import { toast } from "sonner";
import { apiV1, authFetch } from "@/lib/api";

interface McpServer {
  id: string;
  name: string;
  url: string;
  description?: string;
  addedAt: string;
}

interface IntegrationState {
  github?: {
    token?: string;
    repoOwner?: string;
    repoName?: string;
    repoUrl?: string;
    syncEnabled?: boolean;
    lastSyncedAt?: string;
  };
  vercel?: {
    token?: string;
    projectId?: string;
    deploymentUrl?: string;
    lastDeployedAt?: string;
  };
  supabase?: {
    projectUrl?: string;
    anonKey?: string;
    projectRef?: string;
  };
  mcpServers?: McpServer[];
}

interface IntegrationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  sessionToken: string;
}

const STORAGE_KEY_PREFIX = "builder_integrations_";

function loadIntegrations(projectId: string): IntegrationState {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${projectId}`);
    if (!raw) return {};
    return JSON.parse(raw) as IntegrationState;
  } catch {
    return {};
  }
}

function saveIntegrations(projectId: string, state: IntegrationState) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${projectId}`, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function IntegrationsDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  sessionToken,
}: IntegrationsDialogProps) {
  const [integrations, setIntegrations] = useState<IntegrationState>({});
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      setIntegrations(loadIntegrations(projectId));
    }
  }, [open, projectId]);

  const persist = useCallback(
    (updated: IntegrationState) => {
      setIntegrations(updated);
      saveIntegrations(projectId, updated);
    },
    [projectId]
  );

  // Auto-sync GitHub every 5 minutes when enabled
  useEffect(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    if (integrations.github?.syncEnabled && integrations.github?.repoName) {
      syncIntervalRef.current = setInterval(() => {
        void triggerGithubSync(false);
      }, 5 * 60 * 1000);
    }
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrations.github?.syncEnabled, integrations.github?.repoName]);

  // ─── GitHub ────────────────────────────────────────────────────────────────
  const [githubToken, setGithubToken] = useState("");
  const [githubRepoName, setGithubRepoName] = useState("");
  const [githubConnecting, setGithubConnecting] = useState(false);
  const [githubSyncing, setGithubSyncing] = useState(false);

  useEffect(() => {
    if (open) {
      setGithubToken(integrations.github?.token ?? "");
      setGithubRepoName(integrations.github?.repoName ?? "");
    }
  }, [open, integrations.github]);

  const handleConnectGithub = async () => {
    if (!githubToken.trim() || !githubRepoName.trim()) {
      toast.error("GitHub token and repository name are required");
      return;
    }
    setGithubConnecting(true);
    try {
      const response = await authFetch(apiV1(`/builder/projects/${projectId}/integrations/github/connect`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: githubToken.trim(), repoName: githubRepoName.trim() }),
      }, sessionToken);
      const data = (await response.json()) as {
        repoUrl?: string;
        repoOwner?: string;
        repoName?: string;
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Failed to connect GitHub");
        return;
      }
      const updated: IntegrationState = {
        ...integrations,
        github: {
          token: githubToken.trim(),
          repoOwner: data.repoOwner,
          repoName: data.repoName ?? githubRepoName.trim(),
          repoUrl: data.repoUrl,
          syncEnabled: true,
          lastSyncedAt: new Date().toISOString(),
        },
      };
      persist(updated);
      toast.success("GitHub repository connected!");
    } catch {
      toast.error("Failed to connect GitHub");
    } finally {
      setGithubConnecting(false);
    }
  };

  const triggerGithubSync = async (showToast = true) => {
    if (!integrations.github?.repoName || !integrations.github?.token) return;
    setGithubSyncing(true);
    try {
      const response = await authFetch(apiV1(`/builder/projects/${projectId}/integrations/github/sync`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: integrations.github.token }),
      }, sessionToken);
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        if (showToast) toast.error(data.error ?? "Sync failed");
        return;
      }
      const updated: IntegrationState = {
        ...integrations,
        github: { ...integrations.github, lastSyncedAt: new Date().toISOString() },
      };
      persist(updated);
      if (showToast) toast.success("Changes pushed to GitHub");
    } catch {
      if (showToast) toast.error("GitHub sync failed");
    } finally {
      setGithubSyncing(false);
    }
  };

  const handleDisconnectGithub = () => {
    const updated: IntegrationState = { ...integrations, github: undefined };
    persist(updated);
    setGithubToken("");
    setGithubRepoName("");
    toast.success("GitHub disconnected");
  };

  // ─── Vercel ────────────────────────────────────────────────────────────────
  const [vercelToken, setVercelToken] = useState("");
  const [vercelDeploying, setVercelDeploying] = useState(false);

  useEffect(() => {
    if (open) setVercelToken(integrations.vercel?.token ?? "");
  }, [open, integrations.vercel]);

  const handleVercelPublish = async () => {
    if (!vercelToken.trim()) {
      toast.error("Vercel token is required");
      return;
    }
    setVercelDeploying(true);
    try {
      const response = await authFetch(apiV1(`/builder/projects/${projectId}/publish/vercel`), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: vercelToken.trim() }),
      }, sessionToken);
      const data = (await response.json()) as { deploymentUrl?: string; error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Deployment failed");
        return;
      }
      const updated: IntegrationState = {
        ...integrations,
        vercel: {
          token: vercelToken.trim(),
          deploymentUrl: data.deploymentUrl,
          lastDeployedAt: new Date().toISOString(),
        },
      };
      persist(updated);
      toast.success("Deployed to Vercel!");
    } catch {
      toast.error("Vercel deployment failed");
    } finally {
      setVercelDeploying(false);
    }
  };

  // ─── Supabase ──────────────────────────────────────────────────────────────
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseAnonKey, setSupabaseAnonKey] = useState("");
  const [supabaseSaving, setSupabaseSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSupabaseUrl(integrations.supabase?.projectUrl ?? "");
      setSupabaseAnonKey(integrations.supabase?.anonKey ?? "");
    }
  }, [open, integrations.supabase]);

  const handleSaveSupabase = () => {
    if (!supabaseUrl.trim()) {
      toast.error("Supabase project URL is required");
      return;
    }
    setSupabaseSaving(true);
    try {
      const ref = supabaseUrl.trim().match(/([a-z0-9]+)\.supabase\.co/)?.[1] ?? "";
      const updated: IntegrationState = {
        ...integrations,
        supabase: {
          projectUrl: supabaseUrl.trim(),
          anonKey: supabaseAnonKey.trim() || undefined,
          projectRef: ref || undefined,
        },
      };
      persist(updated);
      toast.success("Supabase project linked");
    } finally {
      setSupabaseSaving(false);
    }
  };

  // ─── MCP Servers ───────────────────────────────────────────────────────────
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpDescription, setMcpDescription] = useState("");
  const [mcpAdding, setMcpAdding] = useState(false);

  const mcpServers = integrations.mcpServers ?? [];

  const handleAddMcpServer = () => {
    if (!mcpName.trim() || !mcpUrl.trim()) {
      toast.error("Name and URL are required");
      return;
    }
    setMcpAdding(true);
    try {
      const newServer: McpServer = {
        id: crypto.randomUUID(),
        name: mcpName.trim(),
        url: mcpUrl.trim(),
        description: mcpDescription.trim() || undefined,
        addedAt: new Date().toISOString(),
      };
      const updated: IntegrationState = {
        ...integrations,
        mcpServers: [...mcpServers, newServer],
      };
      persist(updated);
      setMcpName("");
      setMcpUrl("");
      setMcpDescription("");
      toast.success("MCP server added");
    } finally {
      setMcpAdding(false);
    }
  };

  const handleRemoveMcpServer = (id: string) => {
    const updated: IntegrationState = {
      ...integrations,
      mcpServers: mcpServers.filter((s) => s.id !== id),
    };
    persist(updated);
    toast.success("MCP server removed");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" aria-describedby="integrations-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" aria-hidden />
            Integrations
          </DialogTitle>
          <DialogDescription id="integrations-desc">
            Connect <strong>{projectName}</strong> to external services — GitHub, Vercel, Supabase, and MCP servers.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0">
          <Tabs defaultValue="github" className="flex flex-col h-full">
            <TabsList className="w-full grid grid-cols-4 shrink-0">
              <TabsTrigger value="github" className="gap-1.5 text-xs">
                <Github className="h-3.5 w-3.5" aria-hidden />
                GitHub
              </TabsTrigger>
              <TabsTrigger value="vercel" className="gap-1.5 text-xs">
                <Globe className="h-3.5 w-3.5" aria-hidden />
                Vercel
              </TabsTrigger>
              <TabsTrigger value="supabase" className="gap-1.5 text-xs">
                <Database className="h-3.5 w-3.5" aria-hidden />
                Supabase
              </TabsTrigger>
              <TabsTrigger value="mcp" className="gap-1.5 text-xs">
                <Server className="h-3.5 w-3.5" aria-hidden />
                MCP
              </TabsTrigger>
            </TabsList>

            {/* ── GitHub ── */}
            <TabsContent value="github" className="flex-1 overflow-auto p-4 space-y-4 m-0">
              <div className="space-y-1">
                <h3 className="font-medium text-sm">GitHub Repository</h3>
                <p className="text-xs text-muted-foreground">
                  Connect a GitHub repo to auto-sync your project files every 5 minutes. Commits are pushed automatically so your repo always reflects the latest state.
                </p>
              </div>

              {integrations.github?.repoUrl ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
                    <Github className="h-5 w-5 shrink-0 text-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {integrations.github.repoOwner}/{integrations.github.repoName}
                      </p>
                      {integrations.github.lastSyncedAt && (
                        <p className="text-xs text-muted-foreground">
                          Last synced: {new Date(integrations.github.lastSyncedAt).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                    <Badge variant={integrations.github.syncEnabled ? "default" : "secondary"} className="text-xs shrink-0">
                      {integrations.github.syncEnabled ? "Auto-sync on" : "Sync off"}
                    </Badge>
                    {integrations.github.repoUrl && (
                      <a
                        href={integrations.github.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label="Open repository on GitHub"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden />
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => void triggerGithubSync(true)}
                      disabled={githubSyncing}
                    >
                      {githubSyncing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Sync now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const updated: IntegrationState = {
                          ...integrations,
                          github: { ...integrations.github, syncEnabled: !integrations.github?.syncEnabled },
                        };
                        persist(updated);
                      }}
                    >
                      {integrations.github.syncEnabled ? "Disable auto-sync" : "Enable auto-sync"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                      onClick={handleDisconnectGithub}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Disconnect
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <Label htmlFor="gh-token">Personal access token</Label>
                    <Input
                      id="gh-token"
                      type="password"
                      placeholder="ghp_xxxxxxxxxxxx"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      aria-describedby="gh-token-hint"
                    />
                    <p id="gh-token-hint" className="text-xs text-muted-foreground">
                      Needs <code>repo</code> scope.{" "}
                      <a
                        href="https://github.com/settings/tokens/new?scopes=repo&description=VibeCoder+Builder"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Create one on GitHub
                      </a>
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="gh-repo">Repository name</Label>
                    <Input
                      id="gh-repo"
                      placeholder="my-app"
                      value={githubRepoName}
                      onChange={(e) => setGithubRepoName(e.target.value)}
                      aria-describedby="gh-repo-hint"
                    />
                    <p id="gh-repo-hint" className="text-xs text-muted-foreground">
                      A new private repo will be created under your account with this name.
                    </p>
                  </div>
                  <Button
                    onClick={() => void handleConnectGithub()}
                    disabled={githubConnecting || !githubToken.trim() || !githubRepoName.trim()}
                    className="gap-2"
                  >
                    {githubConnecting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Github className="h-4 w-4" aria-hidden />
                    )}
                    Connect &amp; create repository
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ── Vercel ── */}
            <TabsContent value="vercel" className="flex-1 overflow-auto p-4 space-y-4 m-0">
              <div className="space-y-1">
                <h3 className="font-medium text-sm">Publish to Vercel</h3>
                <p className="text-xs text-muted-foreground">
                  Deploy your project live to Vercel. You&apos;ll get a public URL instantly.
                </p>
              </div>

              {integrations.vercel?.deploymentUrl && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 mb-2">
                  <Globe className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Last deployment</p>
                    <a
                      href={integrations.vercel.deploymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline truncate block"
                    >
                      {integrations.vercel.deploymentUrl}
                    </a>
                  </div>
                  <Badge variant="default" className="text-xs shrink-0">Live</Badge>
                </div>
              )}

              <div className="space-y-3">
                <div className="grid gap-2">
                  <Label htmlFor="vercel-token">Vercel access token</Label>
                  <Input
                    id="vercel-token"
                    type="password"
                    placeholder="vercel_token_xxxx"
                    value={vercelToken}
                    onChange={(e) => setVercelToken(e.target.value)}
                    aria-describedby="vercel-hint"
                  />
                  <p id="vercel-hint" className="text-xs text-muted-foreground">
                    <a
                      href="https://vercel.com/account/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Create a token on vercel.com/account/tokens
                    </a>
                  </p>
                </div>
                <Button
                  onClick={() => void handleVercelPublish()}
                  disabled={vercelDeploying || !vercelToken.trim()}
                  className="gap-2"
                >
                  {vercelDeploying ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Globe className="h-4 w-4" aria-hidden />
                  )}
                  {integrations.vercel?.deploymentUrl ? "Redeploy to Vercel" : "Deploy to Vercel"}
                </Button>
              </div>
            </TabsContent>

            {/* ── Supabase ── */}
            <TabsContent value="supabase" className="flex-1 overflow-auto p-4 space-y-4 m-0">
              <div className="space-y-1">
                <h3 className="font-medium text-sm">Supabase Project</h3>
                <p className="text-xs text-muted-foreground">
                  Link a Supabase project. The credentials will be injected into your app&apos;s environment when building.
                </p>
              </div>

              {integrations.supabase?.projectUrl && (
                <div className="flex items-center gap-2 rounded-lg border bg-green-500/10 border-green-500/30 p-2 text-xs">
                  <Check className="h-4 w-4 text-green-600 shrink-0" aria-hidden />
                  <span className="text-green-700 dark:text-green-400">
                    Connected to <strong>{integrations.supabase.projectRef ?? "Supabase"}</strong>
                  </span>
                </div>
              )}

              <div className="space-y-3">
                <div className="grid gap-2">
                  <Label htmlFor="sb-url">Project URL</Label>
                  <Input
                    id="sb-url"
                    placeholder="https://xxxx.supabase.co"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sb-anon">Anon key <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="sb-anon"
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={supabaseAnonKey}
                    onChange={(e) => setSupabaseAnonKey(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleSaveSupabase}
                  disabled={supabaseSaving || !supabaseUrl.trim()}
                  className="gap-2"
                >
                  {supabaseSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Database className="h-4 w-4" aria-hidden />
                  )}
                  {integrations.supabase?.projectUrl ? "Update Supabase config" : "Link Supabase project"}
                </Button>
              </div>
            </TabsContent>

            {/* ── MCP Servers ── */}
            <TabsContent value="mcp" className="flex-1 overflow-auto p-4 space-y-4 m-0">
              <div className="space-y-1">
                <h3 className="font-medium text-sm">MCP Servers</h3>
                <p className="text-xs text-muted-foreground">
                  Add Model Context Protocol servers. The AI agent can discover and use these when building your app (e.g. database tools, search, custom APIs).
                </p>
              </div>

              {mcpServers.length > 0 && (
                <ul className="space-y-2" role="list" aria-label="MCP servers">
                  {mcpServers.map((server) => (
                    <li
                      key={server.id}
                      className="flex items-start gap-2 rounded-lg border bg-card p-3"
                    >
                      <Server className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{server.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{server.url}</p>
                        {server.description && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5">{server.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMcpServer(server.id)}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        aria-label={`Remove MCP server ${server.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <Separator />

              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Add new server</p>
                <div className="grid gap-2">
                  <Label htmlFor="mcp-name">Name</Label>
                  <Input
                    id="mcp-name"
                    placeholder="My Database Tools"
                    value={mcpName}
                    onChange={(e) => setMcpName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mcp-url">Server URL</Label>
                  <Input
                    id="mcp-url"
                    placeholder="https://mcp.example.com/sse"
                    value={mcpUrl}
                    onChange={(e) => setMcpUrl(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mcp-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="mcp-desc"
                    placeholder="What this server provides"
                    value={mcpDescription}
                    onChange={(e) => setMcpDescription(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleAddMcpServer}
                  disabled={mcpAdding || !mcpName.trim() || !mcpUrl.trim()}
                  className="gap-2"
                >
                  {mcpAdding ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden />
                  )}
                  Add MCP server
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
