"use client";

import { useMemo, useState, useEffect, Fragment } from "react";
import { ProjectFile } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { getFileIconProps } from "@/lib/file-icons";
import { ChevronRight, Folder as FolderIcon, FolderOpen, Pencil, Trash2 } from "lucide-react";

type FileTreeProps = {
  files: ProjectFile[];
  activePath?: string;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  onRename?: (path: string, isFolder: boolean) => void;
};

type TreeNode = {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  placeholderPath?: string;
};

const INDENT_PX = 12;

function buildTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isFolder: true, children: [] };

  const folderMap = new Map<string, TreeNode>([["", root]]);

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (isLast) {
        if (part === ".keep") {
          current.placeholderPath = file.path;
          return;
        }

        current.children.push({
          name: part,
          path: currentPath,
          isFolder: false,
          children: [],
        });
        return;
      }

      if (!folderMap.has(currentPath)) {
        const node: TreeNode = {
          name: part,
          path: currentPath,
          isFolder: true,
          children: [],
        };
        folderMap.set(currentPath, node);
        current.children.push(node);
      }

      current = folderMap.get(currentPath)!;
    });
  }

  const sortChildren = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortChildren);
  };

  sortChildren(root);
  return root.children;
}

function ensureAncestorExpansion(path: string, set: Set<string>): Set<string> {
  const next = new Set(set);
  next.add("");
  const parts = path.split("/").filter(Boolean);
  let cursor = "";
  for (let i = 0; i < parts.length - 1; i++) {
    cursor = cursor ? `${cursor}/${parts[i]}` : parts[i];
    next.add(cursor);
  }
  return next;
}

export function FileTree({ files, activePath, onSelect, onDelete, onRename }: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([""]));

  useEffect(() => {
    if (!activePath) return;
    setExpanded((prev) => ensureAncestorExpansion(activePath, prev));
  }, [activePath]);

  const toggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isExpanded = node.isFolder ? expanded.has(node.path || "") : false;
    const isActive = node.path === activePath;
    const paddingLeft = 8 + depth * INDENT_PX;

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (node.isFolder) {
        const placeholder = node.placeholderPath ?? `${node.path}/.keep`;
        onDelete(placeholder);
      } else {
        onDelete(node.path);
      }
    };

    const handleRename = (e: React.MouseEvent) => {
      e.stopPropagation();
      onRename?.(node.path, node.isFolder);
    };

    const icon = !node.isFolder ? getFileIconProps(node.path) : null;

    return (
      <Fragment key={node.path || "__root"}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-accent",
            isActive && "bg-accent"
          )}
          style={{ paddingLeft }}
          onClick={() => (node.isFolder ? toggleFolder(node.path || "") : onSelect(node.path))}
        >
          {node.isFolder ? (
            <button
              type="button"
              className="mr-1 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(node.path || "");
              }}
              aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
            >
              <ChevronRight className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-90")} />
            </button>
          ) : (
            <span className="w-5" />
          )}

          <div className="flex items-center gap-2 flex-1 min-w-0">
            {node.isFolder ? (
              <>{isExpanded ? <FolderOpen className="h-4 w-4 text-blue-500" /> : <FolderIcon className="h-4 w-4 text-blue-500" />}</>
            ) : (
              <img
                src={icon?.src || "/icons/file.svg"}
                alt={icon?.alt || `${node.name} icon`}
                className="h-4 w-4 flex-shrink-0 object-contain"
                onError={(event) => {
                  (event.target as HTMLImageElement).src = "/icons/file.svg";
                }}
              />
            )}
            <span className="truncate">{node.name || "root"}</span>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onRename && (
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={handleRename}
                aria-label="Rename"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-destructive/90 hover:text-destructive-foreground"
              onClick={handleDelete}
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {node.isFolder && isExpanded && node.children.length > 0 && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </Fragment>
    );
  };

  return <div className="text-sm">{tree.map((node) => renderNode(node, 0))}</div>;
}
