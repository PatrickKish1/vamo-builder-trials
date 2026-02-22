"use client";

import React, { useState, useRef, useCallback } from "react";
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
import { Loader2, Sparkles, Upload, ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiV1 } from "@/lib/api";

interface ProjectLogoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  currentLogoUrl: string | null;
  sessionToken: string;
  onLogoUpdated: (url: string | null) => void;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/svg+xml"];
const MAX_SIZE_MB = 2;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ProjectLogoModal({
  open,
  onOpenChange,
  projectId,
  projectName,
  currentLogoUrl,
  sessionToken,
  onLogoUpdated,
}: ProjectLogoModalProps) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [generatingLogo, setGeneratingLogo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync preview whenever currentLogoUrl or dialog open state changes
  React.useEffect(() => {
    if (open) setPreviewUrl(currentLogoUrl);
  }, [open, currentLogoUrl]);

  const saveLogo = useCallback(
    async (url: string | null) => {
      const response = await fetch(apiV1("/builder/projects"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ projectId, logoUrl: url }),
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Failed to save logo");
      }
    },
    [projectId, sessionToken]
  );

  const handleGenerateLogo = async () => {
    setGeneratingLogo(true);
    try {
      const response = await fetch(apiV1(`/builder/projects/${projectId}/generate-logo`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ prompt: aiPrompt.trim() || undefined, projectName }),
      });
      const data = (await response.json()) as { logoUrl?: string; error?: string };
      if (!response.ok || !data.logoUrl) {
        toast.error(data.error ?? "Logo generation failed");
        return;
      }
      setPreviewUrl(data.logoUrl);
      await saveLogo(data.logoUrl);
      onLogoUpdated(data.logoUrl);
      toast.success("Logo generated and saved!");
    } catch (err) {
      console.error("Logo generation error:", err);
      toast.error("Failed to generate logo");
    } finally {
      setGeneratingLogo(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Unsupported file type. Use PNG, JPEG, WebP, GIF or SVG.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`File too large. Maximum size is ${MAX_SIZE_MB}MB.`);
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setPreviewUrl(dataUrl);
      await saveLogo(dataUrl);
      onLogoUpdated(dataUrl);
      toast.success("Logo uploaded!");
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Failed to upload logo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    setRemoving(true);
    try {
      await saveLogo(null);
      setPreviewUrl(null);
      onLogoUpdated(null);
      toast.success("Logo removed");
    } catch {
      toast.error("Failed to remove logo");
    } finally {
      setRemoving(false);
    }
  };

  const initials = projectName.charAt(0).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby="logo-modal-desc">
        <DialogHeader>
          <DialogTitle>Project logo</DialogTitle>
          <DialogDescription id="logo-modal-desc">
            Set a logo for <strong>{projectName}</strong>. Generate one with AI or upload your own.
          </DialogDescription>
        </DialogHeader>

        {/* Current logo preview */}
        <div className="flex items-center gap-4 py-2">
          <div className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden border bg-muted/40 flex items-center justify-center">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={`${projectName} logo preview`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-3xl font-bold text-primary select-none" aria-hidden>
                {initials}
              </span>
            )}
            {(uploading || generatingLogo || removing) && (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center" aria-hidden>
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
          </div>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{projectName}</p>
            {previewUrl ? (
              <p className="text-xs">Logo is set</p>
            ) : (
              <p className="text-xs">No logo set yet</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* AI generation */}
          <section aria-label="AI logo generation">
            <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
              Generate with AI
            </h3>
            <div className="flex gap-2">
              <Input
                placeholder={`Logo for ${projectName} (optional prompt)`}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleGenerateLogo()}
                className="flex-1"
                aria-label="AI logo prompt (optional)"
                disabled={generatingLogo}
              />
              <Button
                onClick={() => void handleGenerateLogo()}
                disabled={generatingLogo || uploading}
                className="shrink-0 gap-1.5"
              >
                {generatingLogo ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden />
                )}
                {generatingLogo ? "Generating…" : "Generate"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Leave prompt blank to auto-generate based on the project name.
            </p>
          </section>

          {/* Upload */}
          <section aria-label="Upload logo">
            <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Upload className="h-4 w-4" aria-hidden />
              Upload your own
            </h3>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                className="sr-only"
                id="logo-upload-input"
                onChange={(e) => void handleFileChange(e)}
                aria-label="Choose logo file"
                disabled={uploading || generatingLogo}
              />
              <Label
                htmlFor="logo-upload-input"
                className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors w-full justify-center"
                aria-disabled={uploading || generatingLogo}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
                )}
                {uploading ? "Uploading…" : "Click to choose file"}
                <span className="text-xs text-muted-foreground">(PNG, JPG, WebP, SVG · max 2 MB)</span>
              </Label>
            </div>
          </section>

          {/* Remove */}
          {previewUrl && (
            <div className="pt-1 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 w-full"
                onClick={() => void handleRemoveLogo()}
                disabled={removing || uploading || generatingLogo}
              >
                {removing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                )}
                Remove logo
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
