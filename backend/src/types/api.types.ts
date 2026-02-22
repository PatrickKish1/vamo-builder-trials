/**
 * Shared API request/response and auth user shape.
 * Kept compatible with frontend AuthContext and API expectations.
 */
export interface User {
  id: string;
  email: string;
  name: string;
}

export interface SessionResponse {
  user: User | null;
  authenticated: boolean;
}

export interface LoginSignupResponse {
  session?: {
    userId: string;
    token: string;
  };
  user: User;
  /** When true, account was created but email must be confirmed before a session is issued. */
  requiresConfirmation?: boolean;
}

export interface ProjectResponse {
  id: string;
  name: string;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  activeFilePath: string | null;
  openFilePaths: string[];
  dirtyFiles: string[];
  isPlayground: boolean;
  expiresAt?: number;
  /** GitHub repo full name (e.g. org/repo-name) when versioning is enabled */
  githubRepoFullName?: string | null;
  /** Whether backend syncs this project to GitHub on commit/save */
  githubSyncEnabled?: boolean;
}

export interface ProjectFileResponse {
  path: string;
  content: string;
  encoding?: string;
  mimeType?: string | null;
  isFolder?: boolean;
  projectId?: string | null;
  userId?: string | null;
}
