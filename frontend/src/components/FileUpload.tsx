"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FolderOpen, GitBranch, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { FileUploadModal } from "@/components/FileUploadModal";
import JSZip from "jszip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { apiV1 } from "@/lib/api";

export type PendingFile = {
  path: string;
  content: string;
  isFolder: boolean;
  encoding?: "text" | "base64";
  mimeType?: string;
};

const base64ToBlob = (base64: string, mimeType?: string): Blob => {
  const binaryString =
    typeof window !== "undefined"
      ? window.atob(base64)
      : Buffer.from(base64, "base64").toString("binary");
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
};

export const createFolderEntries = (fileEntries: PendingFile[]): PendingFile[] => {
  const folderSet = new Set<string>();
  fileEntries.forEach((file) => {
    const parts = file.path.split("/").filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const folderPath = parts.slice(0, i).join("/");
      folderSet.add(folderPath);
    }
  });

  const folderEntries: PendingFile[] = Array.from(folderSet).map((path) => ({
    path,
    content: "",
    isFolder: true,
  }));

  const deduped = new Map<string, PendingFile>();
  [...folderEntries, ...fileEntries].forEach((entry) => {
    if (entry.path) {
      deduped.set(entry.path, entry);
    }
  });

  return Array.from(deduped.values()).sort((a, b) => a.path.localeCompare(b.path));
};

/** Process a FileList (e.g. folder picker) into a preview list; excludes ignored dirs and adds folder entries. For use in builder or other flows that show FileUploadModal. */
export async function processFileListForPreview(fileList: FileList | null): Promise<PendingFile[]> {
  if (!fileList || fileList.length === 0) return [];

  const textFiles: PendingFile[] = [];

  for (const file of Array.from(fileList)) {
    const path = (file.webkitRelativePath || file.name).replace(/^\//, "");
    const lowerName = file.name.toLowerCase();
    const isZip =
      lowerName.endsWith(".zip") ||
      file.type === "application/zip" ||
      file.type === "application/x-zip-compressed";

    if (shouldIgnore(path, false)) continue;

    if (isZip) {
      const zipEntries = await extractZipFile(file);
      textFiles.push(...zipEntries);
    } else {
      const { content, encoding, mimeType } = await readFileWithEncoding(file);
      textFiles.push({
        path,
        content,
        isFolder: false,
        encoding,
        mimeType,
      });
    }
  }

  const filtered = textFiles.filter((entry) => !shouldIgnore(entry.path, entry.isFolder));
  return createFolderEntries(filtered);
}

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".mp4",
  ".webm",
  ".mov",
  ".mkv",
  ".avi",
  ".mp3",
  ".wav",
  ".ogg",
  ".pdf",
]);

const inferMimeType = (path: string): string | undefined => {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  if (lower.endsWith(".avi")) return "video/x-msvideo";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return undefined;
};

const shouldTreatAsBinary = (fileName: string, fileType: string | undefined): boolean => {
  const lowerName = fileName.toLowerCase();
  const dotIndex = lowerName.lastIndexOf(".");
  const ext = dotIndex >= 0 ? lowerName.slice(dotIndex) : "";
  if (ext && BINARY_EXTENSIONS.has(ext)) {
    return true;
  }
  if (!fileType) {
    return false;
  }
  if (fileType.startsWith("text/")) {
    return false;
  }
  if (fileType.includes("json") || fileType.includes("xml") || fileType.includes("javascript")) {
    return false;
  }
  return true;
};

const readFileWithEncoding = (
  file: File,
): Promise<{ content: string; encoding: "text" | "base64"; mimeType?: string }> =>
  new Promise((resolve, reject) => {
    const treatAsBinary = shouldTreatAsBinary(file.name, file.type);
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    if (treatAsBinary) {
      reader.onload = (event) => {
        const result = (event.target?.result as string) ?? "";
        const [, meta, data] = result.match(/^data:(.*?);base64,(.*)$/) ?? [];
        resolve({
          content: data || result,
          encoding: "base64",
          mimeType: meta || inferMimeType(file.name),
        });
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = (event) => {
        resolve({
          content: (event.target?.result as string) ?? "",
          encoding: "text",
          mimeType: inferMimeType(file.name),
        });
      };
      reader.readAsText(file);
    }
  });

const normalizeZipPaths = (paths: string[]): string[] => {
  if (paths.length === 0) {
    return paths;
  }
  const segments = paths
    .map((path) => path.split("/").filter(Boolean))
    .filter((parts) => parts.length > 0);

  if (segments.length === 0) {
    return paths;
  }

  const firstSegment = segments[0][0];
  const hasCommonRoot = segments.every((parts) => parts[0] === firstSegment);

  if (!hasCommonRoot) {
    return paths;
  }

  return paths
    .map((path) => {
      if (path.startsWith(`${firstSegment}/`)) {
        return path.substring(firstSegment.length + 1);
      }
      if (path === firstSegment) {
        return "";
      }
      return path;
    })
    .filter(Boolean);
};

const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".svelte-kit",
  ".vercel",
  ".turbo",
  ".pnpm",
  "dist",
  "build",
  "coverage",
  "__pycache__",
  "venv",
  ".idea",
  ".vscode",
  ".cache",
  "tmp",
  "temp",
  "storybook-static",
  "target",
  "out",
]);

/** Paths matching these are excluded from the list (e.g. node_modules, .git). .env files are not excluded here so they appear in the preview; the modal unchecks them by default so the user can opt in. */
const shouldIgnore = (path: string, isFolder: boolean): boolean => {
  const segments = path.split("/").filter(Boolean);
  if (segments.some((segment) => IGNORED_DIR_NAMES.has(segment))) {
    return true;
  }
  return false;
};

const extractZipFile = async (file: File): Promise<PendingFile[]> => {
  const zip = await JSZip.loadAsync(file);
  const allPaths: string[] = [];
  zip.forEach((relativePath) => {
    allPaths.push(relativePath);
  });

  const normalizedPaths = normalizeZipPaths(allPaths);
  const pathMap = new Map<string, string>();
  allPaths.forEach((originalPath, index) => {
    const normalized = normalizedPaths[index];
    if (normalized !== undefined) {
      pathMap.set(originalPath, normalized.replace(/\/$/, ""));
    }
  });

  const extracted: PendingFile[] = [];
  const uniqueFolders = new Set<string>();

  await Promise.all(
    Object.keys(zip.files).map(async (relativePath) => {
      const entry = zip.files[relativePath];
      if (!entry) {
        return;
      }
      const normalizedPath = pathMap.get(relativePath);
      if (!normalizedPath) {
        return;
      }

      if (entry.dir) {
        if (normalizedPath && !shouldIgnore(normalizedPath, true)) {
          uniqueFolders.add(normalizedPath);
        }
        return;
      }

      try {
        const content = await entry.async("string");
        if (!shouldIgnore(normalizedPath, false)) {
          extracted.push({
            path: normalizedPath,
            content,
            isFolder: false,
            encoding: "text",
            mimeType: inferMimeType(normalizedPath),
          });
        }
      } catch (error) {
        const base64 = await entry.async("base64");
        if (!shouldIgnore(normalizedPath, false)) {
          extracted.push({
            path: normalizedPath,
            content: base64,
            isFolder: false,
            encoding: "base64",
            mimeType: inferMimeType(normalizedPath),
          });
        }
      }
    }),
  );

  uniqueFolders.forEach((folder) => {
    extracted.push({
      path: folder,
      content: "",
      isFolder: true,
    });
  });

  return createFolderEntries(extracted.filter((file) => file.path && file.path.length > 0));
};

const collectFilesFromItems = async (items: DataTransferItemList): Promise<PendingFile[]> => {
  const collected: PendingFile[] = [];

  const readDirectoryEntries = (directory: any): Promise<any[]> =>
    new Promise((resolve, reject) => {
      const reader = directory.createReader();
      const entries: any[] = [];
      const readBatch = () => {
        reader.readEntries(
          (batch: any[]) => {
            if (!batch.length) {
              resolve(entries);
            } else {
              entries.push(...batch);
              readBatch();
            }
          },
          (error: DOMException) => reject(error),
        );
      };
      readBatch();
    });

  const traverseEntry = async (entry: any, currentPath = ""): Promise<void> => {
    if (!entry) {
      return;
    }

    if (entry.isFile) {
      await new Promise<void>((resolve, reject) => {
        entry.file(
          async (file: File) => {
            try {
              const { content, encoding, mimeType } = await readFileWithEncoding(file);
              const relativePath = currentPath ? `${currentPath}/${file.name}` : file.name;
              if (!shouldIgnore(relativePath, false)) {
                collected.push({
                  path: relativePath,
                  content,
                  isFolder: false,
                  encoding,
                  mimeType,
                });
              }
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          (error: DOMException) => reject(error),
        );
      });
    } else if (entry.isDirectory) {
      const dirPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      if (shouldIgnore(dirPath, true)) {
        return;
      }
      collected.push({
        path: dirPath,
        content: "",
        isFolder: true,
      });
      const entries = await readDirectoryEntries(entry);
      await Promise.all(entries.map((child) => traverseEntry(child, dirPath)));
    }
  };

  const itemPromises = Array.from(items)
    .filter((item) => item.kind === "file")
    .map((item) => {
      const webkitGetAsEntry = (item as any).webkitGetAsEntry;
      if (typeof webkitGetAsEntry === "function") {
        const entry = webkitGetAsEntry.call(item);
        if (entry) {
          return traverseEntry(entry);
        }
      }

      const file = item.getAsFile();
      if (file) {
        if (shouldIgnore(file.name, false)) {
          return Promise.resolve();
        }
        return readFileWithEncoding(file).then(({ content, encoding, mimeType }) => {
          collected.push({
            path: file.name,
            content,
            isFolder: false,
            encoding,
            mimeType,
          });
        });
      }

      return Promise.resolve();
    });

  await Promise.all(itemPromises);
  const filtered = collected.filter((entry) => !shouldIgnore(entry.path, entry.isFolder));
  return createFolderEntries(filtered);
};

type FileUploadProps = {
  onFilesUploaded: (
    files: Array<{
      path: string;
      content: string;
      isFolder: boolean;
      encoding?: "text" | "base64";
    }>,
  ) => void;
  projectId?: string;
};

export function FileUpload({ onFilesUploaded, projectId }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<
    Array<{ path: string; content: string; isFolder: boolean; encoding?: "text" | "base64" }>
  >([]);
  const [githubModalOpen, setGithubModalOpen] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [githubBranches, setGithubBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [tokenExpanded, setTokenExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, isPlayground, sessionToken } = useAuth();

  useEffect(() => {
    if (!githubModalOpen) {
      setGithubUrl("");
      setGithubBranches([]);
      setSelectedBranch("");
      setGithubToken("");
      setBranchesLoading(false);
      setImportLoading(false);
      setGithubError(null);
      setTokenExpanded(false);
    }
  }, [githubModalOpen]);

  useEffect(() => {
    if (githubBranches.length > 0 && !selectedBranch) {
      setSelectedBranch(githubBranches[0]);
    }
  }, [githubBranches, selectedBranch]);

  const processFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      setUploading(true);
      try {
        const textFiles: PendingFile[] = [];

        for (const file of Array.from(fileList)) {
          const path = (file.webkitRelativePath || file.name).replace(/^\//, "");
          const lowerName = file.name.toLowerCase();
          const isZip =
            lowerName.endsWith(".zip") ||
            file.type === "application/zip" ||
            file.type === "application/x-zip-compressed";

          if (shouldIgnore(path, false)) {
            continue;
          }

          if (isZip) {
            const zipEntries = await extractZipFile(file);
            textFiles.push(...zipEntries);
          } else {
            const { content, encoding, mimeType } = await readFileWithEncoding(file);
            textFiles.push({
              path,
              content,
              isFolder: false,
              encoding,
              mimeType,
            });
          }
        }

        const filtered = textFiles.filter((entry) => !shouldIgnore(entry.path, entry.isFolder));
        const withFolders = createFolderEntries(filtered);

        if (withFolders.length === 0) {
          toast.error("Nothing to upload after ignoring environment and dependency folders.");
        } else {
          setPendingFiles(withFolders);
          setShowModal(true);
          toast.success(`${withFolders.filter((file) => !file.isFolder).length} files ready to review.`);
        }
      } catch (error) {
        console.error("Error processing files:", error);
        toast.error("Failed to process files. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [createFolderEntries],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const items = e.dataTransfer.items;
      const hasDirectorySupport =
        items &&
        Array.from(items).some((item) => {
          const webkitGetAsEntry = (item as any).webkitGetAsEntry;
          return typeof webkitGetAsEntry === "function" && webkitGetAsEntry.call(item);
        });

      if (hasDirectorySupport && items) {
        setUploading(true);
        try {
          const collected = await collectFilesFromItems(items);
          if (collected.length === 0) {
            toast.error("No files detected in the dropped folder.");
          } else {
            setPendingFiles(collected);
            setShowModal(true);
            toast.success(`${collected.filter((file) => !file.isFolder).length} files ready to review.`);
          }
        } catch (error) {
          console.error("Error processing dropped folder:", error);
          toast.error("Failed to process dropped folder. Please try again.");
        } finally {
          setUploading(false);
        }
      } else {
        processFiles(e.dataTransfer.files);
      }
    },
    [collectFilesFromItems, processFiles],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      processFiles(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [processFiles],
  );

  const handleConfirmUpload = useCallback(
    async (
      selectedFiles: Array<{ path: string; content: string; isFolder: boolean; encoding?: "text" | "base64"; mimeType?: string }>,
    ) => {
    setUploading(true);
    
    try {
      // Always pass files to callback - the page component will handle database uploads
      // for both playground and authenticated projects
      await onFilesUploaded(selectedFiles);
      toast.success(`${selectedFiles.filter((file) => !file.isFolder).length} files uploaded successfully.`);
    } catch (error) {
      console.error("Error uploading files:", error);
      toast.error("Failed to upload files. Please try again.");
    } finally {
      setUploading(false);
    }
  },
  [onFilesUploaded]);

  const handleFetchBranches = useCallback(async () => {
    if (!githubUrl.trim()) {
      setGithubError("Enter a repository URL or owner/name first.");
      return;
    }

    setBranchesLoading(true);
    setGithubError(null);
    try {
      const response = await fetch(apiV1("/github/branches"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repoUrl: githubUrl.trim(),
          token: githubToken.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const message = data?.details?.message || data?.error || "Failed to fetch branches";
        throw new Error(message);
      }

      const branches: string[] = data?.data?.branches || data?.branches || [];
      if (branches.length === 0) {
        setGithubBranches([]);
        setSelectedBranch("");
        setGithubError("No branches found for this repository.");
        toast.error("No branches found for this repository.");
      } else {
        setGithubBranches(branches);
        setSelectedBranch(branches[0]);
        toast.success("Branches loaded.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch branches";
      setGithubError(message);
      toast.error(message);
    } finally {
      setBranchesLoading(false);
    }
  }, [githubUrl, githubToken]);

  const handleGithubImport = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!githubUrl.trim()) {
        setGithubError("Please enter a GitHub repository URL (e.g., owner/repo or https://github.com/owner/repo).");
        return;
      }

      setImportLoading(true);
      setGithubError(null);

      try {
        const response = await fetch(apiV1("/github/import"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repoUrl: githubUrl.trim(),
            branch: selectedBranch || undefined,
            token: githubToken.trim() || undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          const message = data?.details?.message || data?.error || "Failed to import repository";
          throw new Error(message);
        }

        const repoFiles: PendingFile[] = (data?.data?.files || data?.files || []).filter(
          (entry: PendingFile) => entry.path && entry.path.length > 0,
        );

        if (repoFiles.length === 0) {
          setGithubError("Repository archive is empty or could not be parsed.");
          toast.error("Repository archive is empty or could not be parsed.");
        } else {
          setPendingFiles(createFolderEntries(repoFiles));
          setShowModal(true);
          setGithubModalOpen(false);
          toast.success("Repository imported. Review the files before uploading.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to import repository";
        setGithubError(message);
        toast.error(message);
      } finally {
        setImportLoading(false);
      }
    },
    [githubUrl, selectedBranch, githubToken, createFolderEntries],
  );

  return (
    <>
      <div
        className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Upload className="h-8 w-8" />
            <FolderOpen className="h-8 w-8" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">
              {isDragging ? "Drop files here" : "Drag and drop a folder, .zip, or files"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              You&apos;ll get a preview to check out before uploading
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            {...({ webkitdirectory: '' } as any)}
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Processing…" : "Select folder, zip, or files"}
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => setGithubModalOpen(true)}
          className="w-full sm:w-auto"
        >
          <GitBranch className="mr-2 h-4 w-4" />
          Import from GitHub
        </Button>
      </div>
      
      <FileUploadModal
        open={showModal}
        onOpenChange={(open) => {
          setShowModal(open);
          if (!open) setPendingFiles([]);
        }}
        files={pendingFiles}
        onConfirm={handleConfirmUpload}
        onCancel={() => setPendingFiles([])}
      />

      <Dialog open={githubModalOpen} onOpenChange={setGithubModalOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleGithubImport} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Import from GitHub</DialogTitle>
              <DialogDescription>
                Paste a repository URL (or owner/name). Optionally fetch branches and provide a personal access token for
                private repos.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="github-repo">Repository URL or owner/name</Label>
              <Input
                id="github-repo"
                placeholder="vercel/next.js or https://github.com/vercel/next.js"
                value={githubUrl}
                onChange={(event) => setGithubUrl(event.target.value)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="github-branch-select">Branch</Label>
                  <select
                    id="github-branch-select"
                    value={selectedBranch}
                    onChange={(event) => setSelectedBranch(event.target.value)}
                    disabled={branchesLoading || githubBranches.length === 0}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {githubBranches.length === 0 ? (
                      <option value="">Default (main)</option>
                    ) : (
                      githubBranches.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleFetchBranches}
                  disabled={branchesLoading || !githubUrl.trim()}
                >
                  {branchesLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading
                    </>
                  ) : (
                    "Fetch branches"
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Fetch branches to choose a specific branch or tag. Leave blank to use the default branch.
              </p>
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-0"
                onClick={() => setTokenExpanded((prev) => !prev)}
              >
                {tokenExpanded ? (
                  <ChevronUp className="mr-2 h-4 w-4" />
                ) : (
                  <ChevronDown className="mr-2 h-4 w-4" />
                )}
                {tokenExpanded ? "Hide personal access token" : "Use personal access token"}
              </Button>
              {tokenExpanded && (
                <div className="space-y-2">
                  <Input
                    type="password"
                    placeholder="GitHub token (for private repos or higher rate limits)"
                    value={githubToken}
                    onChange={(event) => setGithubToken(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your token is used only for this request and is not stored.
                  </p>
                </div>
              )}
            </div>

            {githubError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {githubError}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGithubModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={importLoading || !githubUrl.trim()}>
                {importLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  "Import repository"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

