"use client";

import * as React from "react";
import Editor from "@monaco-editor/react";
import { getFileIconProps } from "@/lib/file-icons";

type CodeEditorProps = {
  path?: string;
  value: string;
  encoding?: "text" | "base64";
  mimeType?: string;
  onChange: (code: string) => void;
  onSave?: () => void;
};

function guessLanguageFromPath(path?: string): string | undefined {
  if (!path) return undefined;
  const lower = path.toLowerCase();
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js")) return "javascript";
  if (lower.endsWith(".jsx")) return "javascript";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".sql")) return "sql";
  if (lower.endsWith(".py")) return "python";
  return undefined;
}

function inferMimeType(path?: string, fallback?: string): string | undefined {
  if (!path) return fallback;
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
  return fallback;
}

function encodeStringToBase64(input: string): string | null {
  try {
    if (typeof window !== "undefined" && "TextEncoder" in window) {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(input);
      let binary = "";
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return window.btoa(binary);
    }
    if (typeof globalThis === "object" && "Buffer" in globalThis) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (globalThis as any).Buffer.from(input, "utf-8").toString("base64");
    }
    return null;
  } catch (error) {
    console.error("Failed to convert string to base64", error);
    return null;
  }
}

export function CodeEditor({ path, value, encoding, mimeType, onChange, onSave }: CodeEditorProps) {
  const language = guessLanguageFromPath(path);
  const lowerPath = path?.toLowerCase() ?? "";
  const isSvg = lowerPath.endsWith(".svg");
  const isImage =
    !isSvg &&
    (lowerPath.endsWith(".png") ||
      lowerPath.endsWith(".jpg") ||
      lowerPath.endsWith(".jpeg") ||
      lowerPath.endsWith(".gif") ||
      lowerPath.endsWith(".bmp") ||
      lowerPath.endsWith(".ico") ||
      lowerPath.endsWith(".webp"));
  const isVideo =
    lowerPath.endsWith(".mp4") ||
    lowerPath.endsWith(".webm") ||
    lowerPath.endsWith(".mov") ||
    lowerPath.endsWith(".mkv") ||
    lowerPath.endsWith(".avi");
  const isAudio = lowerPath.endsWith(".mp3") || lowerPath.endsWith(".wav") || lowerPath.endsWith(".ogg");
  const isPdf = lowerPath.endsWith(".pdf");
  const canPreview = isSvg || isImage || isVideo || isAudio || isPdf;

  const [svgViewMode, setSvgViewMode] = React.useState<"preview" | "code">("preview");
  React.useEffect(() => {
    setSvgViewMode("preview");
  }, [path]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onSave?.();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onSave]);

  const iconProps = path ? getFileIconProps(path) : null;
  const resolvedMime = mimeType ?? inferMimeType(path);
  const previewDataUrl = React.useMemo(() => {
    if (!path || !canPreview || !value) return null;
    const mime = resolvedMime || "application/octet-stream";
    if (encoding === "base64") {
      return `data:${mime};base64,${value}`;
    }
    const encoded = encodeStringToBase64(value);
    if (!encoded) return null;
    return `data:${mime};base64,${encoded}`;
  }, [path, value, encoding, resolvedMime, canPreview]);

  const showPreview = canPreview && (isSvg ? svgViewMode === "preview" : true);
  const showEditor =
    !!path &&
    (!canPreview ||
      (isSvg && svgViewMode === "code") ||
      (!isImage && !isVideo && !isAudio && !isPdf && encoding !== "base64"));

  return (
    <div className="h-full w-full flex flex-col">
      <div className="px-3 py-2 border-b flex items-center gap-2 text-xs text-muted-foreground justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {iconProps && (
            <img
              src={iconProps.src}
              alt={iconProps.alt}
              className="h-4 w-4 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/icons/file.svg";
              }}
            />
          )}
          <span className="truncate">{path || "No file selected"}</span>
        </div>
        {isSvg && path && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span>View:</span>
            <button
              className={`rounded px-2 py-1 transition ${svgViewMode === "preview" ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
              onClick={() => setSvgViewMode("preview")}
            >
              Rendered
            </button>
            <button
              className={`rounded px-2 py-1 transition ${svgViewMode === "code" ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
              onClick={() => setSvgViewMode("code")}
            >
              Code
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 relative">
        {!path && (
          <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
            Select a file to begin editing.
          </div>
        )}
        {showPreview && previewDataUrl && (
          <div className={`h-full w-full overflow-auto ${showEditor ? "border-b" : ""}`}>
            {isImage || isSvg ? (
              <div className="flex h-full w-full items-center justify-center bg-muted/30 p-4">
                <img src={previewDataUrl} alt={path} className="max-h-full max-w-full object-contain" />
              </div>
            ) : isVideo ? (
              <div className="flex h-full w-full items-center justify-center bg-black/80">
                <video controls className="max-h-full max-w-full" src={previewDataUrl}>
                  Your browser does not support embedded video playback.
                </video>
              </div>
            ) : isAudio ? (
              <div className="flex h-full w-full items-center justify-center bg-muted/30">
                <audio controls src={previewDataUrl} className="w-3/4">
                  Your browser does not support embedded audio playback.
                </audio>
              </div>
            ) : isPdf ? (
              <iframe title={path} src={previewDataUrl} className="h-full w-full border-0" />
            ) : null}
          </div>
        )}
        {showEditor && (
          <Editor
            height="100%"
            defaultLanguage={language}
            language={language}
            theme="vs-dark"
            value={value}
            className="scale-[1.0]"
            onChange={(v) => onChange(v ?? "")}
            options={{
              fontSize: 16,
              minimap: { enabled: false },
              wordWrap: "on",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 8, bottom: 8 },
            }}
            loading={<div className="p-3 text-sm text-muted-foreground">Loading editor…</div>}
            path={path}
            onMount={(_editor, monaco) => {
              if (language !== "typescript" && language !== "javascript") return;
              const ts = monaco.languages.typescript;
              ts.typescriptDefaults.setCompilerOptions({
                target: monaco.languages.typescript.ScriptTarget.ES2020,
                module: monaco.languages.typescript.ModuleKind.ESNext,
                moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
                jsx: monaco.languages.typescript.JsxEmit.React,
                allowJs: true,
                skipLibCheck: true,
                allowNonTsExtensions: true,
                noEmit: true,
                esModuleInterop: true,
                resolveJsonModule: true,
                isolatedModules: true,
              });
              const stubLib =
                "declare module 'next' { const n: unknown; export default n; }\n" +
                "declare module 'next/*' { const n: unknown; export default n; }\n" +
                "declare module 'react' { const r: unknown; export default r; }\n" +
                "declare module 'react-dom' { const r: unknown; export default r; }\n" +
                "declare module 'react/jsx-runtime' { export const jsx: unknown; export const jsxs: unknown; export const Fragment: unknown; }\n";
              ts.typescriptDefaults.setExtraLibs([
                { content: stubLib, filePath: "file:///node_modules/@builder-stubs.d.ts" },
              ]);
            }}
          />
        )}
        {canPreview && !previewDataUrl && path && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-background">
            Preview unavailable for this file.
          </div>
        )}
      </div>
    </div>
  );
}
