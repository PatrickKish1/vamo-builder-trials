"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { FileTree } from "./FileTree";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as React from "react";

type ProjectSidebarProps = {
  projectName: string;
  files: { path: string; content: string }[];
  activePath?: string;
  onSelectFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onCreateFile: (path: string) => void;
  onCreateFolder?: (path: string) => void;
  onRename?: (oldPath: string, newPath: string, isFolder: boolean) => void;
};

export function ProjectSidebar({ projectName, files, activePath, onSelectFile, onDeleteFile, onCreateFile, onCreateFolder, onRename }: ProjectSidebarProps) {
  let inputRef: HTMLInputElement | null = null;
  let folderRef: HTMLInputElement | null = null;
  const [confirmPath, setConfirmPath] = React.useState<string | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<{ oldPath: string; isFolder: boolean } | null>(null);
  let renameRef: HTMLInputElement | null = null;

  function handleCreate() {
    const proposed = inputRef?.value?.trim();
    if (!proposed) return;
    onCreateFile(proposed);
    if (inputRef) inputRef.value = "";
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2">
        <div className="font-semibold truncate">{projectName}</div>
      </div>
      <Separator />
      <div className="p-2">
        <div className="flex gap-2">
          <Input placeholder="New File" ref={(el) => { inputRef = el; }} />
          <Button size="sm" onClick={handleCreate}>Add</Button>
        </div>
        <div className="flex gap-2 mt-2">
          <Input placeholder="New Folder" ref={(el) => { folderRef = el; }} />
          <Button size="sm" variant="secondary" onClick={() => { const p = folderRef?.value?.trim(); if (!p) return; onCreateFolder?.(p); if (folderRef) folderRef.value = ""; }}>Folder</Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <FileTree files={files} activePath={activePath} onSelect={onSelectFile} onDelete={(p) => setConfirmPath(p)} onRename={(p, isFolder) => setRenameTarget({ oldPath: p, isFolder })} />
      </div>

      <Dialog open={!!confirmPath} onOpenChange={(o) => !o && setConfirmPath(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete</DialogTitle>
          </DialogHeader>
          <div className="text-sm">Are you sure you want to delete <span className="font-mono">{confirmPath}</span>?</div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmPath(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (confirmPath) onDeleteFile(confirmPath); setConfirmPath(null); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {renameTarget?.isFolder ? "Folder" : "File"}</DialogTitle>
          </DialogHeader>
          <Input defaultValue={renameTarget?.oldPath || ""} ref={(el) => { renameRef = el; }} />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button onClick={() => { const np = renameRef?.value?.trim(); if (!np || !renameTarget) return; onRename?.(renameTarget.oldPath, np, renameTarget.isFolder); setRenameTarget(null); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


