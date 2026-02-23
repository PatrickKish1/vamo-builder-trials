import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
    },
  },
});

export const queryKeys = {
  auth: ["auth"] as const,
  session: ["auth", "session"] as const,
  profile: ["profile"] as const,
  projects: ["builder", "projects"] as const,
  project: (id: string) => ["builder", "projects", id] as const,
  files: (projectId: string) => ["builder", "files", projectId] as const,
  marketplace: ["marketplace"] as const,
} as const;
