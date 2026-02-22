"use client";

import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Folder, File, Upload, CheckCircle2 } from "lucide-react";
import { getFileIconProps } from "@/lib/file-icons";

interface FileItem {
  path: string;
  content: string;
  isFolder: boolean;
  encoding?: "text" | "base64";
  mimeType?: string;
}

interface FileUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: FileItem[];
  onConfirm: (files: FileItem[]) => void;
  onCancel?: () => void;
}

/** Paths that look like .env files; unchecked by default in the list for security. */
function isEnvPath(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  const filename = segments[segments.length - 1]?.toLowerCase() ?? "";
  return filename.startsWith(".env");
}

// Build a tree structure from flat file list
interface FileTreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: FileTreeNode[];
  selected: boolean;
}

function buildFileTree(files: FileItem[], selectedPaths: Set<string>): FileTreeNode[] {
  const root: FileTreeNode = {
    name: "root",
    path: "",
    isFolder: true,
    children: [],
    selected: true,
  };

  const pathMap = new Map<string, FileTreeNode>();
  pathMap.set("", root);

  // Add all files and folders to the tree
  files.forEach((file) => {
    const parts = file.path.split("/").filter(p => p); // Filter out empty parts
    let currentPath = "";
    let current = root;

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      const newPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!pathMap.has(newPath)) {
        const node: FileTreeNode = {
          name: part,
          path: newPath,
          isFolder: !isLast || file.isFolder,
          children: [],
          selected: selectedPaths.has(newPath),
        };
        pathMap.set(newPath, node);
        current.children.push(node);
      }
      
      currentPath = newPath;
      current = pathMap.get(newPath)!;
    });
  });

  // Sort children: folders first, then files
  function sortChildren(node: FileTreeNode) {
    node.children.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortChildren);
  }

  sortChildren(root);
  return root.children;
}

export function FileUploadModal({
  open,
  onOpenChange,
  files,
  onConfirm,
  onCancel,
}: FileUploadModalProps) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() =>
    new Set(files.filter((f) => !isEnvPath(f.path)).map((f) => f.path)),
  );

  React.useEffect(() => {
    if (open) {
      setSelectedPaths(
        new Set(files.filter((f) => !isEnvPath(f.path)).map((f) => f.path)),
      );
    }
  }, [files, open]);

  const fileTree = useMemo(() => {
    return buildFileTree(files, selectedPaths);
  }, [files, selectedPaths]);

  const toggleSelection = (path: string, isFolder: boolean) => {
    const newSelected = new Set(selectedPaths);
    
    if (isFolder) {
      // Find the folder node and toggle it and all children
      const findAndToggle = (nodes: FileTreeNode[]): FileTreeNode | null => {
        for (const node of nodes) {
          if (node.path === path) {
            const isCurrentlySelected = newSelected.has(path);
            
            if (isCurrentlySelected) {
              // Remove folder and all children
              newSelected.delete(path);
              const removeChildren = (child: FileTreeNode) => {
                newSelected.delete(child.path);
                child.children.forEach(removeChildren);
              };
              node.children.forEach(removeChildren);
            } else {
              // Add folder and all children
              newSelected.add(path);
              const addChildren = (child: FileTreeNode) => {
                newSelected.add(child.path);
                child.children.forEach(addChildren);
              };
              node.children.forEach(addChildren);
            }
            return node;
          }
          const found = findAndToggle(node.children);
          if (found) return found;
        }
        return null;
      };
      
      findAndToggle(fileTree);
    } else {
      // For files, just toggle
      if (newSelected.has(path)) {
        newSelected.delete(path);
      } else {
        newSelected.add(path);
      }
    }
    
    setSelectedPaths(newSelected);
  };

  const selectedCount = selectedPaths.size;
  const totalCount = files.length;

  const handleConfirm = () => {
    const selectedFiles = files.filter((f) => selectedPaths.has(f.path));
    onConfirm(selectedFiles);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const renderTreeNode = (node: FileTreeNode, depth: number = 0): React.ReactNode => {
    const isSelected = selectedPaths.has(node.path);
    const indent = depth * 20;

    return (
      <div key={node.path}>
        <div
          className={`flex items-center gap-2 py-1 px-2 hover:bg-muted/50 cursor-pointer rounded ${
            isSelected ? "bg-primary/10" : ""
          }`}
          style={{ paddingLeft: `${8 + indent}px` }}
          onClick={() => toggleSelection(node.path, node.isFolder)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {node.isFolder ? (
              <Folder className="h-4 w-4 text-blue-500 shrink-0" />
            ) : (
              <div className="h-4 w-4 shrink-0 relative flex items-center justify-center">
                {(() => {
                  const iconProps = getFileIconProps(node.path);
                  return (
                    <img
                      src={iconProps.src}
                      alt={iconProps.alt}
                      className="h-4 w-4 object-contain"
                      onError={(event) => {
                        (event.target as HTMLImageElement).src = "/icons/file.svg";
                      }}
                    />
                  );
                })()}
              </div>
            )}
            <span className="text-sm truncate">{node.name}</span>
          </div>
          {isSelected && (
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          )}
        </div>
        {node.isFolder && node.children.length > 0 && (
          <div>{node.children.map((child) => renderTreeNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Review before upload</DialogTitle>
          <DialogDescription>
            Check out the files and folders below first. Select or unselect items, then confirm to upload.
            Zip contents are shown as a tree; only selected items will be added to the project.
            .env files are unchecked by default for security; you can include them if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-sm text-muted-foreground">
              {selectedCount} of {totalCount} files selected
            </span>
          </div>
          <ScrollArea className="flex-1 border rounded-md">
            <div className="p-2">
              {fileTree.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No files to preview
                </div>
              ) : (
                fileTree.map((node) => renderTreeNode(node))
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selectedCount === 0}>
            <Upload className="h-4 w-4 mr-2" />
            Upload {selectedCount} {selectedCount === 1 ? "file" : "files"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

