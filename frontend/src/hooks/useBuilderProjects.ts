import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiV1, authFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-client";

export interface BuilderProjectItem {
  id: string;
  name: string;
  framework: string;
  status: string;
  progressScore: number;
  pineappleCount: number;
  logoUrl?: string | null;
}

async function fetchProjects(sessionToken: string | null): Promise<BuilderProjectItem[]> {
  if (!sessionToken) return [];
  const response = await authFetch(apiV1("/builder/projects"), {
    credentials: "include",
  }, sessionToken);
  const data = (await response.json()) as {
    projects?: Array<{
      id: string;
      name: string;
      framework: string;
      status: string;
      progressScore?: number;
      pineappleCount?: number;
      logoUrl?: string | null;
    }>;
  };
  return (data.projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    framework: p.framework,
    status: p.status,
    progressScore: p.progressScore ?? 0,
    pineappleCount: p.pineappleCount ?? 0,
    logoUrl: p.logoUrl ?? null,
  }));
}

export function useBuilderProjects(sessionToken: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.projects],
    queryFn: () => fetchProjects(sessionToken),
    enabled: enabled && !!sessionToken,
  });
}

export function useDeleteBuilderProject(sessionToken: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      if (!sessionToken) throw new Error("Not authenticated");
      const response = await authFetch(apiV1("/builder/projects"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      }, sessionToken);
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Failed to delete");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}
