"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, Copy, Undo2, RefreshCw, Lightbulb, Zap, Users, TrendingUp, HelpCircle, Play, ChevronRight } from "lucide-react";
import { CodeGenerationResponse } from "@/lib/ai-service";
import { apiV1, authFetch } from "@/lib/api";
import { Message, MessageContent } from "@/components/ui/message";
import Orb from "@/components/Orb";
import { MessageRenderer } from "./MessageRenderer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ChatTag = "plan" | "feature" | "customer" | "revenue" | "ask" | null;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  tag?: ChatTag;
  codeActions?: CodeGenerationResponse["codeActions"];
  errorRetryContent?: string;
  isPlanResponse?: boolean;
  pineapplesEarned?: number;
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

const TAG_CONFIG: Record<NonNullable<ChatTag>, { label: string; icon: React.ElementType; color: string; badgeVariant: "default" | "secondary" | "outline" | "destructive" }> = {
  plan: {
    label: "Plan",
    icon: Lightbulb,
    color: "text-purple-500",
    badgeVariant: "secondary",
  },
  feature: {
    label: "Feature",
    icon: Zap,
    color: "text-blue-500",
    badgeVariant: "default",
  },
  customer: {
    label: "Customer",
    icon: Users,
    color: "text-green-500",
    badgeVariant: "secondary",
  },
  revenue: {
    label: "Revenue",
    icon: TrendingUp,
    color: "text-yellow-500",
    badgeVariant: "secondary",
  },
  ask: {
    label: "Ask",
    icon: HelpCircle,
    color: "text-muted-foreground",
    badgeVariant: "outline",
  },
};

interface ChatPanelProps {
  onCodeAction: (
    action: NonNullable<CodeGenerationResponse["codeActions"]>[number]
  ) => void;
  currentFile?: string;
  projectFiles?: Array<{ path: string; content: string }>;
  selectedCode?: string;
  projectId?: string;
  /** When true, apply code actions automatically and do not show Apply buttons (builder flow). */
  autoApplyCodeActions?: boolean;
  /** When set (builder flow), fetch project files from /builder/files for chat context. */
  builderFilesToken?: string | null;
  /** Coding model for /chat (groq, openai, claude, gemini, grok). */
  chatModelId?: string;
  /** Session token for authenticated chat (rewards). */
  sessionToken?: string | null;
  /** Called when pineapples are earned from this message. */
  onReward?: (amount: number, newBalance: number) => void;
  /** When set (e.g. after scaffold ready), send this prompt once and then clear via onTriggerSendComplete. */
  triggerSendPrompt?: string | null;
  /** Called after triggerSendPrompt has been sent so parent can clear it. */
  onTriggerSendComplete?: () => void;
  /** When this value changes, messages are reloaded from localStorage (e.g. after build page saved initial prompt). */
  reloadMessagesKey?: number;
  /** Called when the response indicates files were applied via the file-plan flow (so parent can refresh file list). */
  onFilesApplied?: () => void;
  /** When true (view-only collaborator), disable sending messages and show clone hint. */
  builderViewOnly?: boolean;
}

export function ChatPanel({
  onCodeAction,
  currentFile,
  projectFiles,
  selectedCode,
  projectId,
  autoApplyCodeActions = false,
  builderFilesToken,
  chatModelId,
  sessionToken,
  onReward,
  triggerSendPrompt,
  onTriggerSendComplete,
  reloadMessagesKey,
  onFilesApplied,
  builderViewOnly = false,
}: ChatPanelProps) {
  const [selectedTag, setSelectedTag] = useState<ChatTag>(null);

  const stripAnsi = useCallback((s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").trim(), []);

  const STORAGE_KEY_PREFIX = "builder_chat_";
  const loadPersistedMessages = useCallback((pid: string): ChatMessage[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${pid}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (m): m is ChatMessage =>
          typeof m === "object" &&
          m !== null &&
          typeof (m as ChatMessage).id === "string" &&
          ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
          typeof (m as ChatMessage).content === "string" &&
          typeof (m as ChatMessage).timestamp === "number"
      );
    } catch {
      return [];
    }
  }, []);

  const THREAD_STORAGE_PREFIX = "builder_thread_";
  const getPersistedThreadId = useCallback((pid: string): string | null => {
    if (typeof window === "undefined") return null;
    try {
      return window.sessionStorage.getItem(`${THREAD_STORAGE_PREFIX}${pid}`);
    } catch {
      return null;
    }
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    projectId ? loadPersistedMessages(projectId) : []
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(() =>
    projectId ? getPersistedThreadId(projectId) : null
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const triggerSentRef = useRef<string | null>(null);
  const persistedProjectIdRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const createNewThread = useCallback(async () => {
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (sessionToken) {
      }
      const response = await authFetch(apiV1("/thread"), { method: "POST", headers });
      const data = await response.json();
      if (data.threadId) {
        setThreadId(data.threadId);
        if (projectId && typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem(`${THREAD_STORAGE_PREFIX}${projectId}`, data.threadId);
          } catch {
            /* ignore */
          }
        }
      } else if (!response.ok) {
        console.error("Failed to create thread:", response.status, data);
      }
    } catch (error) {
      console.error("Failed to create thread:", error);
    }
  }, [sessionToken, projectId]);

  useEffect(() => {
    if (threadId) return;
    const persisted = projectId ? getPersistedThreadId(projectId) : null;
    if (persisted) {
      setThreadId(persisted);
      return;
    }
    createNewThread();
  }, [threadId, projectId, getPersistedThreadId, createNewThread]);

  useEffect(() => {
    if (!projectId) return;
    if (persistedProjectIdRef.current !== projectId) {
      persistedProjectIdRef.current = projectId;
      const loaded = loadPersistedMessages(projectId);
      setMessages(loaded);
    }
  }, [projectId, loadPersistedMessages]);

  useEffect(() => {
    if (projectId && reloadMessagesKey !== undefined && reloadMessagesKey > 0) {
      const loaded = loadPersistedMessages(projectId);
      setMessages(loaded);
    }
  }, [projectId, reloadMessagesKey, loadPersistedMessages]);

  useEffect(() => {
    if (!projectId || typeof window === "undefined") return;
    try {
      const toStore = messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        codeActions: m.codeActions,
      }));
      window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${projectId}`, JSON.stringify(toStore));
    } catch {
      // ignore storage errors
    }
  }, [projectId, messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Subscribe to realtime file updates to reflect external changes
  useEffect(() => {
    try {
      const es = new EventSource(apiV1("/realtime"));
      const handler = (e: MessageEvent) => {
        // Optionally handle incoming events if we want to reflect streaming updates
        // For now, no-op; UI already listens to local state updates.
      };
      es.addEventListener("file:created", handler as EventListener);
      es.addEventListener("file:updated", handler as EventListener);
      es.addEventListener("file:renamed", handler as EventListener);
      es.addEventListener("file:deleted", handler as EventListener);
      return () => {
        es.close();
      };
    } catch {
      // ignore
    }
  }, []);

  const detectPlanResponse = useCallback((content: string): boolean => {
    const lower = content.toLowerCase();
    const planKeywords = ["plan:", "step 1", "step 2", "phase 1", "phase 2", "## plan", "### plan", "here's a plan", "here is a plan", "proposed plan", "action plan", "breakdown:"];
    return planKeywords.some((kw) => lower.includes(kw));
  }, []);

  const sendWithPrompt = useCallback(
    async (promptContent: string, tag?: ChatTag) => {
      if (!promptContent.trim() || !threadId) return;

      const activeTag = tag ?? selectedTag;

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: promptContent,
        timestamp: Date.now(),
        tag: activeTag ?? undefined,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setSelectedTag(null);

      try {
        let filesContext = projectFiles || [];
        if (projectId) {
          try {
            const filesUrl = builderFilesToken
              ? apiV1(`/builder/files?projectId=${projectId}`)
              : apiV1(`/files?projectId=${projectId}`);
            const filesResponse = await authFetch(filesUrl, { credentials: "include" });
            const filesData = await filesResponse.json();
            if (filesData.files) {
              const MAX_FILES = 28;
              const MAX_CONTENT_PER_FILE = 60 * 1024;
              const MAX_TOTAL_CONTEXT = 4 * 1024 * 1024;
              const raw = filesData.files
                .filter((f: { isFolder?: boolean; path?: string }) => !f.isFolder && typeof f.path === "string")
                .filter((f: { path: string }) => !f.path.includes("node_modules") && !f.path.includes(".next/"));
              let total = 0;
              const limited: { path: string; content: string }[] = [];
              for (const f of raw) {
                if (limited.length >= MAX_FILES || total >= MAX_TOTAL_CONTEXT) break;
                let content = (f as { path: string; content?: string }).content ?? "";
                if (content.length > MAX_CONTENT_PER_FILE) content = content.slice(0, MAX_CONTENT_PER_FILE) + "\n\n/* ... truncated */";
                const size = (f as { path: string }).path.length + content.length;
                if (total + size > MAX_TOTAL_CONTEXT && limited.length > 0) break;
                total += size;
                limited.push({ path: (f as { path: string }).path, content });
              }
              filesContext = limited;
            }
          } catch (error) {
            console.error("Failed to fetch project files for chat context:", error);
          }
        }

        const idempotencyKey =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const headers: Record<string, string> = { "Content-Type": "application/json" };

        let response: Response;
        try {
          response = await authFetch(apiV1("/chat"), {
            method: "POST",
            credentials: "include",
            headers,
            body: JSON.stringify({
              threadId,
              prompt: promptContent,
              ...(chatModelId ? { model: chatModelId } : {}),
              ...(projectId ? { projectId, idempotencyKey } : {}),
              ...(activeTag ? { tag: activeTag } : {}),
              context: {
                currentFile,
                projectFiles: filesContext,
                selectedCode,
                projectId,
              },
            }),
          });
        } catch (networkErr) {
          console.error("[chat] Network error:", networkErr);
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "Could not reach the server. Check that the backend is running and try again.",
              timestamp: Date.now(),
              errorRetryContent: promptContent,
            },
          ]);
          return;
        }

        let data: CodeGenerationResponse & {
          pineapplesEarned?: number;
          newBalance?: number;
          appliedFiles?: Array<{ path: string; action: string }>;
          error?: string;
        };
        try {
          data = await response.json();
        } catch {
          console.error("[chat] Failed to parse response JSON, status:", response.status);
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: `Server returned an unexpected response (HTTP ${response.status}). Please try again.`,
              timestamp: Date.now(),
              errorRetryContent: promptContent,
            },
          ]);
          return;
        }

        if (!response.ok) {
          const errText = data.error ?? `Server error (${response.status})`;
          console.error("[chat] API error:", errText);
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: errText,
              timestamp: Date.now(),
              errorRetryContent: promptContent,
            },
          ]);
          return;
        }

        const earned = data.pineapplesEarned ?? 0;
        const newBalance = data.newBalance ?? 0;
        if (earned > 0 && onReward) {
          onReward(earned, newBalance);
        }

        const replyContent = typeof data.message === "string" ? stripAnsi(data.message) : String(data.message ?? "");
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: replyContent,
          timestamp: Date.now(),
          codeActions: data.codeActions,
          isPlanResponse: activeTag === "plan" && detectPlanResponse(replyContent),
          pineapplesEarned: earned > 0 ? earned : undefined,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        if (autoApplyCodeActions && data.codeActions?.length) {
          data.codeActions.forEach((action) => onCodeAction(action));
        }
        if (data.appliedFiles?.length && onFilesApplied) {
          onFilesApplied();
        }
      } catch (error) {
        console.error("[chat] Unexpected error:", error);
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: "Something went wrong. Please try again.",
            timestamp: Date.now(),
            errorRetryContent: promptContent,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [
      threadId,
      selectedTag,
      projectId,
      projectFiles,
      builderFilesToken,
      sessionToken,
      chatModelId,
      currentFile,
      selectedCode,
      autoApplyCodeActions,
      onCodeAction,
      onReward,
      onFilesApplied,
      stripAnsi,
      detectPlanResponse,
    ]
  );

  const sendMessage = async () => {
    if (!input.trim() || !threadId) return;
    const currentInput = input;
    setInput("");
    await sendWithPrompt(currentInput);
  };

  const executePlan = useCallback(
    (planContent: string) => {
      const executePrompt = `The plan looks good. Please proceed and implement it step by step now.\n\nPlan to execute:\n${planContent}`;
      void sendWithPrompt(executePrompt, "feature");
    },
    [sendWithPrompt]
  );

  // When scaffold is ready, auto-send the saved builder prompt so the agent generates and applies code
  useEffect(() => {
    if (!triggerSendPrompt?.trim() || !threadId || triggerSentRef.current === triggerSendPrompt) return;
    triggerSentRef.current = triggerSendPrompt;
    sendWithPrompt(triggerSendPrompt).finally(() => {
      onTriggerSendComplete?.();
      triggerSentRef.current = null;
    });
  }, [triggerSendPrompt, threadId, sendWithPrompt, onTriggerSendComplete]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const executeCodeAction = (
    action: NonNullable<CodeGenerationResponse["codeActions"]>[number]
  ) => {
    console.log("ChatPanel: Executing code action:", action);
    onCodeAction(action);
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" aria-hidden />
          <span className="font-semibold">AI Coding Assistant</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full max-h-full p-4">
          <div className="space-y-4 pr-2">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <div className="h-12 w-12 rounded-full overflow-hidden mx-auto mb-4">
                  <Orb hoverIntensity={0.3} rotateOnHover={false} hue={240} />
                </div>
                <p>Start a conversation with the AI coding assistant</p>
                <p className="text-sm mt-1">Use tags to guide the type of response you need</p>
              </div>
            )}
            {messages.map((message, index) => {
              const tagCfg = message.tag ? TAG_CONFIG[message.tag] : null;
              return (
                <Message key={message.id} from={message.role}>
                  <div className="h-8 w-8 rounded-full overflow-hidden shrink-0">
                    {message.role === "user" ? (
                      <Orb hoverIntensity={0.3} rotateOnHover={false} hue={120} />
                    ) : (
                      <Orb hoverIntensity={0.3} rotateOnHover={false} hue={240} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col gap-1 w-[200px] max-w-full">
                    {tagCfg && message.role === "user" && (
                      <div className="flex items-center gap-1 mb-0.5">
                        <Badge variant={tagCfg.badgeVariant} className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                          <tagCfg.icon className={cn("h-2.5 w-2.5", tagCfg.color)} aria-hidden />
                          {tagCfg.label}
                        </Badge>
                      </div>
                    )}
                    <MessageContent variant="contained" className="wrap-break-word whitespace-pre-wrap max-w-full">
                      <MessageRenderer
                        content={message.content}
                        codeActions={message.codeActions}
                      />
                      {!autoApplyCodeActions && message.codeActions && message.codeActions.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <p className="text-sm font-medium">Code Actions:</p>
                          {message.codeActions.map((action, actionIndex) => (
                            <div key={actionIndex} className="bg-background/50 rounded p-2 border">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-mono text-sm truncate">
                                    {action.type.toUpperCase()}: {action.path}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{action.description}</p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => executeCodeAction(action)}
                                  className="shrink-0"
                                >
                                  Apply
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {message.isPlanResponse && (
                        <div className="mt-3 pt-3 border-t border-border/60">
                          <Button
                            size="sm"
                            className="gap-1.5 w-full sm:w-auto"
                            onClick={() => executePlan(message.content)}
                            disabled={isLoading}
                            aria-label="Execute this plan"
                          >
                            <Play className="h-3.5 w-3.5" aria-hidden />
                            Execute Plan
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            Click to start building from this plan, or add changes below first.
                          </p>
                        </div>
                      )}
                    </MessageContent>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {message.errorRetryContent && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => void sendWithPrompt(message.errorRetryContent!)}
                          disabled={isLoading}
                          aria-label="Retry sending this message"
                          title="Retry"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(message.content);
                            toast.success("Copied to clipboard");
                          } catch {
                            toast.error("Failed to copy");
                          }
                        }}
                        aria-label="Copy message"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {message.role === "user" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setInput(message.content);
                            setMessages((prev) => {
                              const next = [...prev];
                              next.splice(index, 1);
                              if (next[index]?.role === "assistant") next.splice(index, 1);
                              return next;
                            });
                            toast.success("Message moved to input. Edit and send to replace.");
                          }}
                          aria-label="Undo: move message back to input"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Timestamp + pineapple earned indicator */}
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <time
                      dateTime={new Date(message.timestamp).toISOString()}
                      className="text-[10px] text-muted-foreground/60"
                    >
                      {formatRelativeTime(message.timestamp)}
                    </time>
                    {message.pineapplesEarned && message.pineapplesEarned > 0 && (
                      <span
                        className="flex items-center gap-0.5 text-[10px] font-medium text-yellow-600 dark:text-yellow-400"
                        aria-label={`Earned ${message.pineapplesEarned} pineapples`}
                        title={`+${message.pineapplesEarned} 🍍 earned`}
                      >
                        <span aria-hidden>🍍</span>
                        +{message.pineapplesEarned}
                      </span>
                    )}
                  </div>
                </Message>
              );
            })}
            {isLoading && (
              <Message from="assistant">
                <div className="h-8 w-8 rounded-full overflow-hidden shrink-0">
                  <Orb hoverIntensity={0.3} rotateOnHover={false} hue={240} />
                </div>
                <MessageContent variant="contained">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full shrink-0" aria-hidden />
                      <span>
                        {autoApplyCodeActions ? "Planning & building…" : "Thinking…"}
                      </span>
                    </div>
                    {autoApplyCodeActions && (
                      <p className="text-xs text-muted-foreground">
                        Applying code changes to your project. The preview will update when ready.
                      </p>
                    )}
                  </div>
                </MessageContent>
              </Message>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>

      <div className="border-t px-3 pt-2 pb-3 space-y-2">
        {/* Tag selector */}
        {!builderViewOnly && (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Message tags">
            {(Object.keys(TAG_CONFIG) as NonNullable<ChatTag>[]).map((tag) => {
              const cfg = TAG_CONFIG[tag];
              const TagIcon = cfg.icon;
              const isActive = selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(isActive ? null : tag)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-transparent text-muted-foreground hover:border-primary/60 hover:text-foreground"
                  )}
                  aria-pressed={isActive}
                  aria-label={`${isActive ? "Remove" : "Add"} ${cfg.label} tag`}
                >
                  <TagIcon className={cn("h-2.5 w-2.5", isActive ? "text-primary" : cfg.color)} aria-hidden />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        )}
        {builderViewOnly && (
          <p className="text-xs text-muted-foreground" role="status">
            You have view-only access. Clone the project from the header to edit and send prompts.
          </p>
        )}
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={
              builderViewOnly
                ? "View-only access. Clone the project to edit."
                : selectedTag === "plan"
                  ? "Describe your idea and the agent will draft a plan…"
                  : selectedTag === "feature"
                    ? "Describe the feature to build and the agent will implement it…"
                    : "Ask me to generate code, fix bugs, or explain concepts…"
            }
            disabled={isLoading || builderViewOnly}
            className="flex-1 min-w-0 min-h-10 max-h-32 resize-none overflow-y-auto py-2"
            rows={1}
            aria-readonly={builderViewOnly}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading || builderViewOnly}
            size="sm"
            className="shrink-0 h-10"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
