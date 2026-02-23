"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ChevronLeft, Plus, Trash2, Flame } from "lucide-react";
import { toast } from "sonner";
import { useBuilderProjects, useDeleteBuilderProject } from "@/hooks/useBuilderProjects";
import { getAuthUrl } from "@/lib/auth-redirect";

function statusBadgeVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "ready") return "default";
  if (status === "scaffolding") return "secondary";
  if (status === "error") return "destructive";
  return "outline";
}

function ProjectCardLogo({ logoUrl, projectName }: { logoUrl: string | null; projectName: string }) {
  const [failed, setFailed] = useState(false);
  const showImg = logoUrl && !failed;
  return (
    <div className="h-10 w-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-muted/30">
      {showImg ? (
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-sm font-bold text-primary">
          {projectName.charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === "ready") return "ACTIVE";
  if (status === "scaffolding") return "BUILDING";
  if (status === "listed") return "LISTED";
  if (status === "error") return "ERROR";
  return status.toUpperCase();
}

function progressEmoji(score: number): string {
  if (score >= 75) return "🚀";
  if (score >= 50) return "⚡";
  if (score >= 25) return "🔥";
  return "🌱";
}

export default function BuilderProjectsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, sessionToken } = useAuth();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const { data: projects = [], isLoading: loading } = useBuilderProjects(
    sessionToken,
    Boolean(user && sessionToken)
  );
  const deleteMutation = useDeleteBuilderProject(sessionToken);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(getAuthUrl("/builder/projects"));
    }
  }, [user, authLoading, router]);

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteMutation.mutateAsync(deleteTargetId);
      toast.success("Project deleted");
      setDeleteTargetId(null);
    } catch (error) {
      console.error("Delete project error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete project");
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/builder")} aria-label="Back to builder">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Button>
          <h1 className="text-lg font-semibold">Your projects</h1>
        </div>
        <Button
          size="sm"
          onClick={() => router.push("/builder")}
          className="gap-2"
          aria-label="Create new project"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New project
        </Button>
      </header>

      <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Your projects</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Open a project to use the builder, or create a new one.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <Flame className="h-12 w-12 mx-auto text-muted-foreground opacity-40" aria-hidden />
            <p className="text-lg font-medium">No projects yet</p>
            <p className="text-sm text-muted-foreground">Start building something great.</p>
            <Button className="mt-2" onClick={() => router.push("/builder")}>
              Go to builder
            </Button>
          </div>
        ) : (
          <ul
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            role="list"
          >
            {projects.map((p) => (
                <li key={p.id} className="group relative">
                  <article>
                    <button
                      type="button"
                      onClick={() => router.push(`/builder/build/${p.id}`)}
                      className="w-full text-left rounded-xl border bg-card p-4 hover:shadow-md transition-all hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Open project: ${p.name}`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <ProjectCardLogo logoUrl={p.logoUrl ?? null} projectName={p.name} />
                        <h3 className="text-base font-semibold truncate flex-1 min-w-0">{p.name}</h3>
                      </div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <span aria-hidden>{progressEmoji(p.progressScore)}</span>
                          <span>{p.progressScore}% progress</span>
                        </span>
                        <Badge
                          variant={statusBadgeVariant(p.status)}
                          className="text-[10px] font-bold tracking-wider px-2 py-0.5"
                        >
                          {statusLabel(p.status)}
                        </Badge>
                      </div>
                      {p.pineappleCount > 0 && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <span aria-hidden>🍍</span>
                          <span>{p.pineappleCount} in this project</span>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground/60 mt-2 capitalize">
                        {p.framework}
                      </p>
                    </button>
                  </article>
                  <button
                    type="button"
                    onClick={() => setDeleteTargetId(p.id)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    aria-label={`Delete project ${p.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
          </ul>
        )}
      </main>

      <Dialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This will permanently remove the project and all its files. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetId(null)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? (
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
    </div>
  );
}
