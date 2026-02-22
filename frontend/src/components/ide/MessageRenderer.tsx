"use client";

import React from "react";
import { Editor } from "@monaco-editor/react";
import { getFileIconProps } from "@/lib/file-icons";
import { cn } from "@/lib/utils";

interface MessageRendererProps {
  content?: string | null;
  codeActions?: Array<{
    type: string;
    path: string;
    content?: string;
    description: string;
  }>;
}

// File icon component
function FileIcon({ path, className }: { path: string; className?: string }) {
  const iconProps = getFileIconProps(path);
  return (
    <img
      src={iconProps.src}
      alt={iconProps.alt}
      className={cn("h-4 w-4 object-contain", className)}
      onError={(e) => {
        // Fallback to default file icon if image fails to load
        (e.target as HTMLImageElement).src = "/icons/file.svg";
      }}
    />
  );
}

// Helper to guess language from path
function guessLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'py': 'python',
    'java': 'java',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'xml': 'xml',
    'sql': 'sql',
    'php': 'php',
    'go': 'go',
    'rs': 'rust',
    'cpp': 'cpp',
    'c': 'c',
    'sh': 'shell',
    'bash': 'shell',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
  };
  return langMap[ext || ''] || 'text';
}

// Extract code blocks and action blocks from markdown
function parseMessage(content: string | undefined | null) {
  const safe = typeof content === "string" ? content : "";
  // Remove action blocks from display (they're parsed separately)
  const withoutActionBlocks = safe.replace(/```action[\s\S]*?```/g, '');
  
  // Extract code blocks
  const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)```/g;
  const codeBlocks: Array<{ language?: string; content: string; path?: string }> = [];
  const parts: Array<{ type: 'text' | 'code'; content: string; language?: string; path?: string }> = [];
  
  let lastIndex = 0;
  let match;
  
  while ((match = codeBlockRegex.exec(safe)) !== null) {
    const language = match[1];
    const code = match[2].trim();
    
    // Add text before code block
    if (match.index > lastIndex) {
      const text = safe.substring(lastIndex, match.index).trim();
      if (text) {
        parts.push({ type: 'text', content: text });
      }
    }
    
    // Add code block
    parts.push({
      type: 'code',
      content: code,
      language: language || undefined,
    });
    
    codeBlocks.push({ language, content: code });
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < safe.length) {
    const text = safe.substring(lastIndex).trim();
    if (text) {
      parts.push({ type: 'text', content: text });
    }
  }
  
  return { parts, withoutActionBlocks };
}

export function MessageRenderer({ content, codeActions }: MessageRendererProps) {
  const { parts } = parseMessage(content ?? "");
  
  // If we have code actions, use them for better display
  if (codeActions && codeActions.length > 0) {
    return (
      <div className="space-y-4">
        {/* Display text content without action blocks */}
        {parts.map((part, idx) => {
          if (part.type === 'text') {
            // Clean up description - remove comment slashes
            let cleanText = part.content;
            // Remove leading // or # from description lines
            cleanText = cleanText.replace(/^(\/\/|#)\s*/gm, '');
            // Remove empty lines at start/end
            cleanText = cleanText.trim();
            
            if (!cleanText) return null;
            
            return (
              <div key={idx} className="text-sm whitespace-pre-wrap wrap-break-word">
                {cleanText}
              </div>
            );
          }
          return null;
        })}
        
        {/* Display code blocks with actions */}
        {codeActions.map((action, idx) => {
          if (!action.content) return null;
          
          const language = guessLanguage(action.path);
          
          // Extract description from code content (first comment line)
          let codeContent = action.content;
          let description = action.description;
          
          // Try to extract description from first comment
          const firstLine = codeContent.split('\n')[0]?.trim();
          if (firstLine && (firstLine.startsWith('//') || firstLine.startsWith('#'))) {
            const commentText = firstLine.replace(/^(\/\/|#)\s*/, '').trim();
            if (commentText && !description) {
              description = commentText;
            }
          }
          
          return (
            <div key={idx} className="border rounded-lg overflow-hidden bg-muted/30">
              {/* File header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50">
                <FileIcon path={action.path} />
                <span className="text-sm font-mono text-foreground">{action.path}</span>
                <span className="text-xs text-muted-foreground italic ml-auto">
                  {language}
                </span>
              </div>
              
              {/* Code viewer */}
              <div className="bg-[#1e1e1e]">
                <Editor
                  height="200px"
                  defaultLanguage={language}
                  language={language}
                  theme="vs-dark"
                  value={codeContent}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    lineNumbers: 'on',
                    renderLineHighlight: 'none',
                    overviewRulerBorder: false,
                    hideCursorInOverviewRuler: true,
                    overviewRulerLanes: 0,
                    wordWrap: 'on',
                    automaticLayout: true,
                  }}
                />
              </div>
              
              {/* Description */}
              {description && (
                <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/30">
                  {description.replace(/^(\/\/|#)\s*/, '').trim()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  
  // Fallback: render parts normally
  return (
    <div className="space-y-3">
      {parts.map((part, idx) => {
        if (part.type === 'text') {
          let cleanText = part.content;
          cleanText = cleanText.replace(/^(\/\/|#)\s*/gm, '');
          cleanText = cleanText.trim();
          
          if (!cleanText) return null;
          
          return (
            <div key={idx} className="text-sm whitespace-pre-wrap wrap-break-word">
              {cleanText}
            </div>
          );
        } else {
          const language = part.language || 'text';
          return (
            <div key={idx} className="border rounded-lg overflow-hidden bg-muted/30">
              <div className="bg-[#1e1e1e]">
                <Editor
                  height="200px"
                  defaultLanguage={language}
                  language={language}
                  theme="vs-dark"
                  value={part.content}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    automaticLayout: true,
                  }}
                />
              </div>
            </div>
          );
        }
      })}
    </div>
  );
}

