"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ChevronLeft, Activity, MessageSquare, Zap, Search } from "lucide-react";
import { apiV1, authFetch } from "@/lib/api";

interface ActivityItem {
  type: string;
  description: string;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  all: "All types",
  reward_earned: "Pineapples earned",
  prompt: "Prompts",
  chat: "Chat",
  project_created: "Project created",
  code_applied: "Code applied",
};

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

function activityIcon(type: string) {
  if (type === "reward_earned") return <span aria-hidden className="text-base leading-none">🍍</span>;
  if (type === "project_created") return <Zap className="h-4 w-4 text-primary shrink-0" aria-hidden />;
  if (type === "prompt" || type === "chat") return <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />;
  return <Activity className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />;
}

export default function ProjectActivityPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading, sessionToken } = useAuth();
  const projectId = params?.id as string;

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [projectName, setProjectName] = useState<string>("Project");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const loadData = useCallback(async () => {
    if (!sessionToken || !projectId) return;
    setLoading(true);
    try {
      const response = await authFetch(apiV1(`/builder/projects?projectId=${projectId}`), {
        credentials: "include",
      }, sessionToken);
      if (!response.ok) throw new Error("Failed to load project");
      const data = (await response.json()) as {
        project?: {
          name?: string;
          recentActivity?: ActivityItem[];
        };
      };
      setProjectName(data.project?.name ?? "Project");
      setActivities(data.project?.recentActivity ?? []);
    } catch (error) {
      console.error("Failed to load activity:", error);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, projectId]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user && sessionToken) void loadData();
  }, [user, authLoading, sessionToken, router, loadData]);

  const filteredActivities = activities.filter((a) => {
    const matchesType = typeFilter === "all" || a.type === typeFilter;
    const matchesSearch =
      !searchQuery ||
      a.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.type.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const availableTypes = ["all", ...Array.from(new Set(activities.map((a) => a.type)))];

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/builder/build/${projectId}`)}
          aria-label="Back to project"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </Button>
        <div>
          <h1 className="text-base font-semibold">Activity timeline</h1>
          <p className="text-xs text-muted-foreground">{projectName}</p>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
            <Input
              type="search"
              placeholder="Search by description…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              aria-label="Search activities"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="sm:w-[180px]" aria-label="Filter by type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t] ?? t.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredActivities.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-10 w-10 mx-auto mb-3 opacity-40" aria-hidden />
            <p className="font-medium">No activity found</p>
            <p className="text-sm mt-1">
              {searchQuery || typeFilter !== "all"
                ? "Try clearing your filters."
                : "Start chatting or making changes to see activity here."}
            </p>
          </div>
        ) : (
          <ol className="relative border-l border-border ml-3 space-y-0" aria-label="Activity timeline">
            {filteredActivities.map((a, i) => (
              <li key={`${a.createdAt}-${i}`} className="mb-4 ml-5">
                <span className="absolute -left-2.5 mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-background border border-border">
                  {activityIcon(a.type)}
                </span>
                <article className="rounded-lg border bg-card p-3 shadow-xs">
                  <p className="text-sm text-foreground">{a.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="capitalize">{a.type.replace(/_/g, " ")}</span>
                    {" · "}
                    <time dateTime={a.createdAt}>{formatRelativeTime(a.createdAt)}</time>
                  </p>
                </article>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}
