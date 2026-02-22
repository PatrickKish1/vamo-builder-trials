"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogIn, LogOut, User, Play, FolderOpen } from "lucide-react";
import * as React from "react";
import Link from "next/link";
import { readProjectsFromStorage } from "@/lib/projects";

type TopBarProps = {
  projectName: string;
  onCreateProject: () => void;
  onRenameProject: () => void;
  onOpenProject: () => void;
  user?: { id: string; email: string; name: string } | null;
  isPlayground?: boolean;
  onLoginClick?: () => void;
  onLogout?: () => void;
  onTogglePlayground?: (enabled: boolean) => void;
};

export function TopBar({ 
  projectName, 
  onCreateProject, 
  onRenameProject, 
  onOpenProject,
  user,
  isPlayground = false,
  onLoginClick,
  onLogout,
  onTogglePlayground,
}: TopBarProps) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [openOpen, setOpenOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [projects, setProjects] = React.useState(() => readProjectsFromStorage());
  const renameInput = React.useRef<HTMLInputElement | null>(null);
  const filtered = React.useMemo(() => {
    const q = query.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
  }, [projects, query]);
  return (
    <div className="w-full flex items-center gap-2 px-3 py-2 border-b bg-background/50">
      <div className="font-medium truncate">{projectName}</div>
      <Separator orientation="vertical" className="mx-2 h-6" />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onCreateProject}>
          New Project
        </Button>
        <Dialog open={openOpen} onOpenChange={setOpenOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="secondary">Open…</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Open Project</DialogTitle>
            </DialogHeader>
            <Input placeholder="Search by name or id" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="max-h-64 overflow-auto divide-y">
              {filtered.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0 mr-2">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.id}</div>
                  </div>
                  <Link href={`/${p.id}`} className="text-sm underline">Open</Link>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="py-6 text-sm text-muted-foreground text-center">No projects</div>
              )}
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setProjects(readProjectsFromStorage())}>Refresh</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost">Rename</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Project</DialogTitle>
            </DialogHeader>
            <Input ref={renameInput} placeholder="Project name" defaultValue={projectName} />
            <DialogFooter>
              <Button onClick={() => { onRenameProject(); setRenameOpen(false); }}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="ml-auto mr-6 flex items-center gap-2">
        {user && (
          <Button size="sm" variant="ghost" className="gap-2" asChild>
            <Link href="/builder">
              <FolderOpen className="h-4 w-4" aria-hidden />
              Projects
            </Link>
          </Button>
        )}
        {isPlayground && (
          <div className="flex items-center gap-1 text-xs px-2 py-1 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded">
            <Play className="h-3 w-3" />
            Playground Mode
          </div>
        )}
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                {user.name || user.email}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuItem disabled>
                <div className="text-xs text-muted-foreground">{user.email}</div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onTogglePlayground?.(true)}>
                <Play className="mr-2 h-4 w-4" />
                Switch to Playground
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button size="sm" variant="outline" onClick={onLoginClick}>
            <LogIn className="mr-2 h-4 w-4" />
            Login
          </Button>
        )}
        <ThemeToggle />
        <div className="text-xs text-muted-foreground">VibeCoder</div>
      </div>
    </div>
  );
}


