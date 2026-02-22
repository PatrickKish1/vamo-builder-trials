"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, FolderPlus, Mic, Loader2 } from "lucide-react";

export type CreateProjectModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Create an empty project with the given name (stored; loadable after refresh). */
  onEmptyProject: (name: string) => void;
  /** Describe in text; agent builds the project (creates project + files). */
  onBuildWithAI: (description: string) => Promise<void>;
  /** Open voice conversation to describe project with ElevenLabs agent. */
  onSpeakWithAgent?: () => void;
  isPlayground?: boolean;
};

export function CreateProjectModal({
  open,
  onOpenChange,
  onEmptyProject,
  onBuildWithAI,
  onSpeakWithAgent,
  isPlayground = false,
}: CreateProjectModalProps) {
  const [emptyName, setEmptyName] = useState("New Project");
  const [description, setDescription] = useState("");
  const [building, setBuilding] = useState(false);

  const handleEmptyCreate = () => {
    const name = emptyName.trim() || "New Project";
    onEmptyProject(name);
    onOpenChange(false);
    setEmptyName("New Project");
  };

  const handleBuildWithAI = async () => {
    const desc = description.trim();
    if (!desc) return;
    setBuilding(true);
    try {
      await onBuildWithAI(desc);
      onOpenChange(false);
      setDescription("");
    } finally {
      setBuilding(false);
    }
  };

  const handleSpeakWithAgent = () => {
    onSpeakWithAgent?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            A project is a folder with an ID—it gets stored and you can load it after refresh.
            Build one yourself or let the agent create it from a description (text or voice).
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="ai" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ai" className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Build with AI</span>
            </TabsTrigger>
            <TabsTrigger value="voice" className="flex items-center gap-1.5">
              <Mic className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Speak</span>
            </TabsTrigger>
            <TabsTrigger value="empty" className="flex items-center gap-1.5">
              <FolderPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Empty</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="ai" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="create-desc">Describe the project you want</Label>
              <Textarea
                id="create-desc"
                placeholder="e.g. A React todo app with a list and add form, or a Python script that reads a CSV and prints the first 5 rows"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
            <Button
              onClick={handleBuildWithAI}
              disabled={!description.trim() || building}
              className="w-full"
            >
              {building ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Building…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Build project
                </>
              )}
            </Button>
          </TabsContent>
          <TabsContent value="voice" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Describe your project by voice; the agent will respond with voice and then create the project.
            </p>
            <Button
              onClick={handleSpeakWithAgent}
              disabled={!onSpeakWithAgent}
              variant="secondary"
              className="w-full"
            >
              <Mic className="mr-2 h-4 w-4" />
              Speak with agent
            </Button>
            {!onSpeakWithAgent && (
              <p className="text-xs text-muted-foreground">
                Voice creation is available from the IDE when the voice panel is open.
              </p>
            )}
          </TabsContent>
          <TabsContent value="empty" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Project name</Label>
              <Input
                id="create-name"
                value={emptyName}
                onChange={(e) => setEmptyName(e.target.value)}
                placeholder="New Project"
              />
            </div>
            <Button onClick={handleEmptyCreate} className="w-full">
              <FolderPlus className="mr-2 h-4 w-4" />
              Create empty project
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
