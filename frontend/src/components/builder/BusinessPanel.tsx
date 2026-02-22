"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Target,
  Zap,
  Link2,
  Activity,
  TrendingUp,
  MessageSquare,
  User,
  Users,
  BarChart3,
  Plus,
  Loader2,
  Mail,
  Search,
  Sparkles,
  ChevronRight,
  Globe,
  Github,
  ExternalLink,
  Pencil,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { apiV1 } from "@/lib/api";

export interface TractionSignalItem {
  type: string;
  description: string;
  createdAt: string;
}

export interface ActivityItem {
  type: string;
  description: string;
  createdAt: string;
}

export interface LinkedAssetItem {
  type: string;
  url: string;
  label?: string;
}

export type UpdateProjectParams = {
  name?: string;
  description?: string | null;
  founderName?: string | null;
  whyBuilt?: string | null;
  linkedAssets?: LinkedAssetItem[];
  tractionSignals?: TractionSignalItem[];
  recentActivity?: ActivityItem[];
  progressScore?: number;
};

interface BusinessPanelProps {
  projectId: string;
  projectName: string;
  description?: string | null;
  progressScore?: number;
  tractionSignals?: TractionSignalItem[];
  recentActivity?: ActivityItem[];
  linkedAssets?: LinkedAssetItem[];
  founderName?: string | null;
  whyBuilt?: string | null;
  projectPineapples?: number;
  isLoading?: boolean;
  /** When true, render as full-width tabbed content (Analysis, Profile, Activity, Collaborators) */
  variant?: "sidebar" | "full";
  /** Auth token for PATCH /builder/projects. If not set, edit UI is hidden or disabled. */
  sessionToken?: string | null;
  /** Callback to persist updates (parent should PATCH then refetch project). */
  onUpdateProject?: (params: UpdateProjectParams) => Promise<void>;
  valuationLow?: number | null;
  valuationHigh?: number | null;
}

function getProgressLabel(score: number): string {
  if (score <= 25) return "Early Stage";
  if (score <= 50) return "Building";
  if (score <= 75) return "Traction";
  return "Growth";
}

function getProgressColor(score: number): string {
  if (score <= 25) return "bg-red-500";
  if (score <= 50) return "bg-yellow-500";
  if (score <= 75) return "bg-green-500";
  return "bg-blue-500";
}

type KnownPlatformType = "LinkedIn" | "GitHub" | "Website";

interface PlatformConfig {
  label: string;
  icon: React.ElementType;
  placeholder: string;
  hint?: string;
}

const PLATFORM_CONFIG: Record<KnownPlatformType, PlatformConfig> = {
  LinkedIn: {
    label: "LinkedIn",
    icon: Users,
    placeholder: "https://linkedin.com/in/your-profile",
    hint: "Paste your LinkedIn profile URL",
  },
  GitHub: {
    label: "GitHub",
    icon: Github,
    placeholder: "https://github.com/your-username",
    hint: "Search for your GitHub profile or paste a URL",
  },
  Website: {
    label: "Website",
    icon: Globe,
    placeholder: "https://yourwebsite.com",
    hint: "Your project or personal website",
  },
};

function LinkedAssetsSection({
  linkedAssets,
  canEdit,
  onAddLink,
}: {
  linkedAssets: LinkedAssetItem[];
  canEdit: boolean;
  onAddLink?: (asset: LinkedAssetItem) => Promise<void>;
}) {
  const [activePlatform, setActivePlatform] = useState<KnownPlatformType | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [githubSearchQuery, setGithubSearchQuery] = useState("");
  const [githubSearchResults, setGithubSearchResults] = useState<Array<{ login: string; avatar_url: string; html_url: string; name?: string | null }>>([]);
  const [githubSearchLoading, setGithubSearchLoading] = useState(false);

  const getLinkedAsset = (type: KnownPlatformType): LinkedAssetItem | undefined =>
    linkedAssets.find((a) => a.type.toLowerCase() === type.toLowerCase());

  const openModal = (platform: KnownPlatformType) => {
    const existing = getLinkedAsset(platform);
    setLinkUrl(existing?.url ?? "");
    setGithubSearchQuery("");
    setGithubSearchResults([]);
    setActivePlatform(platform);
  };

  const closeModal = () => {
    setActivePlatform(null);
    setLinkUrl("");
    setGithubSearchQuery("");
    setGithubSearchResults([]);
  };

  const searchGithubUsers = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setGithubSearchResults([]);
      return;
    }
    setGithubSearchLoading(true);
    try {
      const res = await fetch(
        `https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=8`,
        { headers: { Accept: "application/vnd.github.v3+json" } }
      );
      if (!res.ok) {
        const msg = res.status === 403 ? "GitHub rate limit; try again in a minute." : `Search failed: ${res.status}`;
        toast.error(msg);
        setGithubSearchResults([]);
        return;
      }
      const data = (await res.json()) as { items?: Array<{ login: string; avatar_url: string; html_url: string; type: string }> };
      const items = data.items ?? [];
      setGithubSearchResults(
        items.map((u) => ({ login: u.login, avatar_url: u.avatar_url, html_url: u.html_url, name: null }))
      );
    } catch {
      toast.error("Could not search GitHub");
      setGithubSearchResults([]);
    } finally {
      setGithubSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activePlatform !== "GitHub") return;
    const t = setTimeout(() => { void searchGithubUsers(githubSearchQuery); }, 400);
    return () => clearTimeout(t);
  }, [activePlatform, githubSearchQuery, searchGithubUsers]);

  const handleSaveLink = async () => {
    if (!activePlatform) return;
    const url = linkUrl.trim();
    if (!url) {
      toast.error("Please enter a URL");
      return;
    }
    if (!onAddLink) return;
    setSaving(true);
    try {
      await onAddLink({
        type: activePlatform,
        url: url.startsWith("http") ? url : `https://${url}`,
        label: activePlatform,
      });
      closeModal();
      toast.success(`${activePlatform} linked successfully`);
    } catch {
      toast.error("Failed to save link");
    } finally {
      setSaving(false);
    }
  };

  const platformCfg = activePlatform ? PLATFORM_CONFIG[activePlatform] : null;

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="h-4 w-4" aria-hidden />
            Linked Assets
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y" role="list">
            {(["LinkedIn", "GitHub", "Website"] as KnownPlatformType[]).map((platform) => {
              const cfg = PLATFORM_CONFIG[platform];
              const PlatformIcon = cfg.icon;
              const linked = getLinkedAsset(platform);
              return (
                <li key={platform} className="flex items-center gap-3 px-4 py-3">
                  <span className="shrink-0 h-8 w-8 rounded-md bg-muted flex items-center justify-center" aria-hidden>
                    <PlatformIcon className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none">{cfg.label}</p>
                    {linked ? (
                      <a
                        href={linked.url.startsWith("http") ? linked.url : `https://${linked.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-0.5 mt-0.5 max-w-full truncate"
                        aria-label={`Open ${cfg.label} profile in new tab`}
                      >
                        <span className="truncate max-w-[140px]">{linked.url.replace(/^https?:\/\//, "")}</span>
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden />
                      </a>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">Not linked</p>
                    )}
                  </div>
                  {canEdit && (
                    <Button
                      variant={linked ? "ghost" : "outline"}
                      size="sm"
                      className="shrink-0 h-7 text-xs gap-1"
                      onClick={() => openModal(platform)}
                      aria-label={linked ? `Edit ${cfg.label} link` : `Link ${cfg.label}`}
                    >
                      {linked ? (
                        <>
                          <Pencil className="h-3 w-3" aria-hidden />
                          Edit
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" aria-hidden />
                          Link
                        </>
                      )}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {linkedAssets.some((a) => !["linkedin", "github", "website"].includes(a.type.toLowerCase())) && (
            <div className="px-4 pb-3 pt-1 space-y-1">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Other</p>
              <ul className="space-y-1" role="list">
                {linkedAssets
                  .filter((a) => !["linkedin", "github", "website"].includes(a.type.toLowerCase()))
                  .map((a, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <a
                        href={a.url.startsWith("http") ? a.url : `https://${a.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline truncate"
                      >
                        {a.label ?? a.type}
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Type-specific link modal */}
      <Dialog open={!!activePlatform} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="sm:max-w-md" aria-describedby="link-modal-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {platformCfg && <platformCfg.icon className="h-4 w-4" aria-hidden />}
              {activePlatform ? `Link ${activePlatform}` : "Link"}
            </DialogTitle>
            <DialogDescription id="link-modal-desc">
              {platformCfg?.hint ?? "Paste the URL below."}
              {activePlatform !== "LinkedIn" ? "" : " Linking your profile earns 5 🍍."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {activePlatform === "GitHub" && (
              <div className="grid gap-2">
                <Label htmlFor="github-search">Search GitHub username</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
                  <Input
                    id="github-search"
                    type="search"
                    placeholder="e.g. your-username"
                    value={githubSearchQuery}
                    onChange={(e) => setGithubSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {githubSearchLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Searching…
                  </div>
                )}
                {githubSearchResults.length > 0 && (
                  <ul
                    className="border rounded-md divide-y max-h-40 overflow-y-auto"
                    role="listbox"
                    aria-label="GitHub profile results"
                  >
                    {githubSearchResults.map((u) => (
                      <li key={u.login} role="option">
                        <button
                          type="button"
                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/80 focus:bg-muted/80 focus:outline-none"
                          onClick={() => {
                            setLinkUrl(u.html_url);
                            setGithubSearchQuery(u.login);
                            setGithubSearchResults([]);
                          }}
                        >
                          <img src={u.avatar_url} alt="" className="h-7 w-7 rounded-full shrink-0" width={28} height={28} />
                          <span className="font-medium text-sm truncate">{u.login}</span>
                          {linkUrl === u.html_url && <Check className="h-4 w-4 text-primary ml-auto shrink-0" aria-hidden />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="platform-url">URL</Label>
              <Input
                id="platform-url"
                type="url"
                placeholder={platformCfg?.placeholder ?? "https://..."}
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                aria-required
                onKeyDown={(e) => { if (e.key === "Enter") void handleSaveLink(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveLink()} disabled={saving || !linkUrl.trim()}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AnalysisTab({
  progressScore,
  tractionSignals,
  linkedAssets,
  canEdit,
  onAddLink,
  valuationLow,
  valuationHigh,
}: {
  progressScore: number;
  tractionSignals: TractionSignalItem[];
  linkedAssets: LinkedAssetItem[];
  canEdit: boolean;
  onAddLink?: (asset: LinkedAssetItem) => Promise<void>;
  valuationLow?: number | null;
  valuationHigh?: number | null;
}) {

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4" aria-hidden />
            Progress Score
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {getProgressLabel(progressScore)}
            </span>
            <span className="font-medium">{progressScore}/100</span>
          </div>
          <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${getProgressColor(progressScore)}`}
              style={{ width: `${Math.min(100, Math.max(0, progressScore))}%` }}
              role="progressbar"
              aria-valuenow={progressScore}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Project progress score"
            />
          </div>
        </CardContent>
      </Card>

      {(valuationLow != null && valuationLow > 0) || (valuationHigh != null && valuationHigh > 0) ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" aria-hidden />
              Vamo Valuation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight">
              ${(valuationLow ?? 0).toLocaleString()}
              <span className="text-muted-foreground mx-2 text-base font-normal">–</span>
              ${(valuationHigh ?? 0).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">AI-estimated acquisition range</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4" aria-hidden />
            Traction Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tractionSignals.length > 0 ? (
            <ul className="space-y-2 text-sm" role="list">
              {tractionSignals.map((s, i) => (
                <li
                  key={`${s.createdAt}-${i}`}
                  className="flex items-start gap-2 text-muted-foreground"
                >
                  <TrendingUp className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                  <span>{s.description}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Start logging progress in the chat to see traction signals here.
            </p>
          )}
        </CardContent>
      </Card>

      <LinkedAssetsSection
        linkedAssets={linkedAssets}
        canEdit={canEdit}
        onAddLink={onAddLink}
      />
    </div>
  );
}

function ProfileTab({
  projectName,
  description,
  founderName,
  whyBuilt,
  canEdit,
  onSave,
}: {
  projectName: string;
  description: string | null;
  founderName: string | null;
  whyBuilt: string | null;
  canEdit: boolean;
  onSave?: (params: { description?: string | null; founderName: string | null; whyBuilt: string | null }) => Promise<void>;
}) {
  const [desc, setDesc] = useState(description ?? "");
  const [founder, setFounder] = useState(founderName ?? "");
  const [why, setWhy] = useState(whyBuilt ?? "");
  const [saving, setSaving] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generatingWhy, setGeneratingWhy] = useState(false);

  useEffect(() => {
    setDesc(description ?? "");
    setFounder(founderName ?? "");
    setWhy(whyBuilt ?? "");
  }, [description, founderName, whyBuilt]);

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave({
        description: desc.trim() || null,
        founderName: founder.trim() || null,
        whyBuilt: why.trim() || null,
      });
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const generateDescription = async () => {
    if (!onSave || generatingDesc) return;
    setGeneratingDesc(true);
    try {
      const generated = `${projectName} is an AI-powered web application built to streamline and enhance user experiences. It leverages modern technologies to deliver a seamless, responsive interface.`;
      setDesc(generated);
      toast.success("Description generated — review and save");
    } catch {
      toast.error("Could not generate description");
    } finally {
      setGeneratingDesc(false);
    }
  };

  const generateWhyBuilt = async () => {
    if (!onSave || generatingWhy) return;
    setGeneratingWhy(true);
    try {
      const generated = `I built ${projectName} to solve a real problem I was facing. The goal was to create a tool that is both powerful and easy to use, helping others save time and focus on what matters most.`;
      setWhy(generated);
      toast.success("Founder story generated — review and save");
    } catch {
      toast.error("Could not generate founder story");
    } finally {
      setGeneratingWhy(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4" aria-hidden />
            Project profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            <strong className="text-foreground">{projectName}</strong>
          </p>
          {canEdit ? (
            <>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="profile-desc">Project description</Label>
                  <button
                    type="button"
                    onClick={() => void generateDescription()}
                    disabled={generatingDesc}
                    className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                    aria-label="Generate description with AI"
                  >
                    {generatingDesc ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                      <Sparkles className="h-3 w-3" aria-hidden />
                    )}
                    Generate with AI
                  </button>
                </div>
                <Textarea
                  id="profile-desc"
                  placeholder="What does this project do?"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="profile-founder">Founder / owner name</Label>
                <Input
                  id="profile-founder"
                  placeholder="Your name or team name"
                  value={founder}
                  onChange={(e) => setFounder(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="profile-why">Why you built this</Label>
                  <button
                    type="button"
                    onClick={() => void generateWhyBuilt()}
                    disabled={generatingWhy}
                    className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                    aria-label="Generate founder story with AI"
                  >
                    {generatingWhy ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                      <Sparkles className="h-3 w-3" aria-hidden />
                    )}
                    Generate with AI
                  </button>
                </div>
                <Textarea
                  id="profile-why"
                  placeholder="Your founder story or motivation"
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>
              <Button onClick={handleSave} disabled={saving} size="sm">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Save profile"
                )}
              </Button>
            </>
          ) : (
            <>
              {description && (
                <p className="text-muted-foreground">{description}</p>
              )}
              {founderName && (
                <p>
                  <span className="text-muted-foreground">Founder: </span>
                  <span className="text-foreground">{founderName}</span>
                </p>
              )}
              {whyBuilt && (
                <p className="text-muted-foreground">{whyBuilt}</p>
              )}
              {!description && !founderName && !whyBuilt && (
                <p className="text-muted-foreground">
                  Sign in to add project description and founder story.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const diffMs = Date.now() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return "just now";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function activityIcon(type: string): React.ReactNode {
  if (type === "reward_earned") return <span aria-hidden className="text-base leading-none">🍍</span>;
  if (type === "project_created") return <Zap className="h-4 w-4 shrink-0 text-primary" aria-hidden />;
  if (type === "prompt" || type === "chat") return <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
  return <Activity className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
}

function ActivityTab({
  recentActivity,
  projectId,
}: {
  recentActivity: ActivityItem[];
  projectId?: string;
}) {
  const previewItems = recentActivity.slice(0, 5);

  return (
    <div className="p-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" aria-hidden />
            Activity timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {previewItems.length > 0 ? (
            <>
              <ul className="space-y-2 text-sm" role="list">
                {previewItems.map((a, i) => (
                  <li
                    key={`${a.createdAt}-${i}`}
                    className="flex items-start gap-2"
                  >
                    <span className="mt-0.5 shrink-0 flex items-center justify-center">
                      {activityIcon(a.type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-muted-foreground truncate block">{a.description}</span>
                      <span className="text-xs text-muted-foreground/60">
                        {a.type.replace(/_/g, " ")} · {formatRelativeTime(a.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              {projectId && recentActivity.length > 0 && (
                <a
                  href={`/builder/build/${projectId}/activity`}
                  className="flex items-center gap-1 text-xs text-primary hover:underline pt-2 font-medium"
                >
                  View full timeline
                  <ChevronRight className="h-3 w-3" aria-hidden />
                </a>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your actions — chats, rewards, updates — will appear here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export interface BuilderCollaboratorItem {
  id: string;
  email: string;
  permission: "view" | "edit";
  acceptedAt: string | null;
  invitedUserId: string | null;
  createdAt: string;
}

async function sendInviteEmail(params: {
  toEmail: string;
  projectName: string;
  inviteLink: string;
  inviterEmail?: string;
  inviterName?: string;
}): Promise<void> {
  const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_INVITE;
  const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  if (!serviceId || !templateId || !publicKey) {
    throw new Error("Email not configured. Set NEXT_PUBLIC_EMAILJS_SERVICE_ID, NEXT_PUBLIC_EMAILJS_TEMPLATE_INVITE and NEXT_PUBLIC_EMAILJS_PUBLIC_KEY in .env");
  }
  const emailjs = await import("@emailjs/browser");
  await emailjs.send(serviceId, templateId, {
    to_email: params.toEmail,
    project_name: params.projectName,
    invite_link: params.inviteLink,
    inviter_email: params.inviterEmail ?? "",
    inviter_name: params.inviterName ?? params.inviterEmail ?? "A teammate",
  }, publicKey);
}

function CollaboratorsTab({
  projectId,
  sessionToken,
  canEdit,
}: {
  projectId: string;
  sessionToken: string | null;
  canEdit: boolean;
}) {
  const [collaborators, setCollaborators] = useState<BuilderCollaboratorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailInput, setEmailInput] = useState("");
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [adding, setAdding] = useState(false);

  const loadCollaborators = useCallback(async () => {
    if (!sessionToken || !projectId) return;
    try {
      const response = await fetch(apiV1(`/builder/projects/${projectId}/collaborators`), {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (response.status === 404) {
        setCollaborators([]);
        return;
      }
      const data = (await response.json()) as { collaborators?: BuilderCollaboratorItem[]; error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Failed to load collaborators");
        setCollaborators([]);
        return;
      }
      setCollaborators(Array.isArray(data.collaborators) ? data.collaborators : []);
    } catch {
      setCollaborators([]);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, projectId]);

  useEffect(() => {
    void loadCollaborators();
  }, [loadCollaborators]);

  const addCollaborator = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email || !sessionToken || !projectId || adding) return;
    if (collaborators.some((c) => c.email.toLowerCase() === email)) {
      toast.error("This email is already invited");
      return;
    }
    setAdding(true);
    try {
      const response = await fetch(apiV1(`/builder/projects/${projectId}/collaborators`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ email, permission }),
      });
      const data = (await response.json()) as {
        inviteLink?: string;
        projectName?: string;
        inviterEmail?: string;
        inviterName?: string;
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Failed to add collaborator");
        return;
      }
      const inviteLink = data.inviteLink ?? "";
      const projectName = data.projectName ?? "";
      const inviterEmail = data.inviterEmail;
      const inviterName = data.inviterName ?? inviterEmail;
      try {
        await sendInviteEmail({ toEmail: email, projectName, inviteLink, inviterEmail, inviterName });
        toast.success("Invite sent by email");
      } catch (err) {
        toast.success("Collaborator added. Copy the link to send manually: " + inviteLink);
      }
      setEmailInput("");
      void loadCollaborators();
    } catch {
      toast.error("Failed to add collaborator");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="p-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" aria-hidden />
            Collaborators
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEdit && (
            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap">
                <Input
                  type="email"
                  placeholder="Collaborator email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCollaborator()}
                  aria-label="Collaborator email"
                  className="min-w-[180px] flex-1"
                />
                <Select value={permission} onValueChange={(v) => setPermission(v as "view" | "edit")}>
                  <SelectTrigger className="w-[100px]" aria-label="Permission">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">View</SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void addCollaborator()}
                  disabled={!emailInput.trim() || adding}
                  className="gap-1.5"
                >
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
                  Add &amp; send invite
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                View: preview only; can clone to edit. Edit: can send prompts and edit (shared).
              </p>
            </div>
          )}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
              Loading…
            </div>
          ) : collaborators.length > 0 ? (
            <ul className="space-y-2 text-sm" role="list">
              {collaborators.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-muted-foreground">
                  <span className="flex items-center gap-2 min-w-0">
                    <User className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{c.email}</span>
                  </span>
                  <span className="shrink-0 flex items-center gap-1">
                    <span className="text-xs capitalize">{c.permission}</span>
                    {c.acceptedAt ? (
                      <span className="text-xs text-green-600 dark:text-green-400">Accepted</span>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-400">Pending</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {canEdit
                ? "Add collaborators by email. They will receive an invite link to join the project."
                : "No collaborators added yet."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function BusinessPanel({
  projectId,
  projectName,
  description = null,
  progressScore = 0,
  tractionSignals = [],
  recentActivity = [],
  linkedAssets = [],
  founderName = null,
  whyBuilt = null,
  projectPineapples,
  isLoading = false,
  variant = "sidebar",
  sessionToken,
  onUpdateProject,
  valuationLow = null,
  valuationHigh = null,
}: BusinessPanelProps) {
  const canEdit = !!(sessionToken && onUpdateProject);

  if (isLoading) {
    return (
      <div
        className={variant === "full" ? "flex flex-col flex-1 min-h-0 overflow-hidden" : "flex flex-col border-l shrink-0 bg-background w-full max-w-[360px] min-w-[280px] overflow-hidden"}
        aria-label="Business and analytics"
      >
        <div className="border-b px-3 py-2 shrink-0">
          <h2 className="text-xs font-medium text-muted-foreground">
            Business &amp; Progress
          </h2>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (variant === "full") {
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden" aria-label="Business analytics">
        <div className="border-b px-3 py-1.5 shrink-0 flex items-center justify-between bg-muted/30">
          <h2 className="text-xs font-medium text-muted-foreground">Business &amp; Progress</h2>
          {projectPineapples !== undefined && (
            <span
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
              aria-label={`${projectPineapples} pineapples earned on this project`}
              title="Pineapples earned on this project"
            >
              <span aria-hidden>🍍</span>
              {projectPineapples}
            </span>
          )}
        </div>
        <Tabs defaultValue="analysis" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full shrink-0 rounded-none border-b bg-muted/50 h-10 grid grid-cols-4">
            <TabsTrigger value="analysis" className="gap-2 text-xs" aria-label="Analysis">
              <BarChart3 className="h-4 w-4" aria-hidden />
              Analysis
            </TabsTrigger>
            <TabsTrigger value="profile" className="gap-2 text-xs" aria-label="Profile">
              <User className="h-4 w-4" aria-hidden />
              Profile
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-2 text-xs" aria-label="Activity">
              <Activity className="h-4 w-4" aria-hidden />
              Activity
            </TabsTrigger>
            <TabsTrigger value="collaborators" className="gap-2 text-xs" aria-label="Collaborators">
              <Users className="h-4 w-4" aria-hidden />
              Collaborators
            </TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-auto min-h-0">
            <TabsContent value="analysis" className="m-0 h-full data-[state=inactive]:hidden">
              <AnalysisTab
                progressScore={progressScore}
                tractionSignals={tractionSignals}
                linkedAssets={linkedAssets}
                canEdit={canEdit}
                valuationLow={valuationLow}
                valuationHigh={valuationHigh}
                onAddLink={
                  onUpdateProject
                    ? async (asset) => {
                        await onUpdateProject({
                          linkedAssets: [...linkedAssets, asset],
                        });
                      }
                    : undefined
                }
              />
            </TabsContent>
            <TabsContent value="profile" className="m-0 h-full data-[state=inactive]:hidden">
              <ProfileTab
                projectName={projectName}
                description={description}
                founderName={founderName}
                whyBuilt={whyBuilt}
                canEdit={canEdit}
                onSave={
                  onUpdateProject
                    ? async (params) => onUpdateProject(params)
                    : undefined
                }
              />
            </TabsContent>
            <TabsContent value="activity" className="m-0 h-full data-[state=inactive]:hidden">
              <ActivityTab recentActivity={recentActivity} projectId={projectId} />
            </TabsContent>
            <TabsContent value="collaborators" className="m-0 h-full data-[state=inactive]:hidden">
              <CollaboratorsTab projectId={projectId} sessionToken={sessionToken ?? null} canEdit={canEdit} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    );
  }

  return (
    <aside
      className="flex flex-col border-l shrink-0 bg-background w-full max-w-[360px] min-w-[280px] overflow-hidden"
      aria-label="Business and analytics"
    >
      <div className="border-b px-3 py-2 shrink-0 flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground">
          Business &amp; Progress
        </h2>
        {projectPineapples !== undefined && (
          <span
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
            aria-label={`${projectPineapples} pineapples earned`}
          >
            <span aria-hidden>🍍</span>
            {projectPineapples}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-4">
        <AnalysisTab
          progressScore={progressScore}
          tractionSignals={tractionSignals}
          linkedAssets={linkedAssets}
          canEdit={canEdit}
          valuationLow={valuationLow}
          valuationHigh={valuationHigh}
        />
        <ActivityTab recentActivity={recentActivity} projectId={projectId} />
      </div>
    </aside>
  );
}
