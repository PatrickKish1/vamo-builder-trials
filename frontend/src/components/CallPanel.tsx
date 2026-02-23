"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Orb from "@/components/Orb";
import VideoOrb from "@/components/VideoOrb";
import { ChatPanel } from "@/components/ide/ChatPanel";
import { LiveWaveform } from "@/components/ui/live-waveform";
import { MicSelector } from "@/components/ui/mic-selector";
import { VoicePicker, Voice } from "@/components/ui/voice-picker";
import * as React from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Phone, MessageSquare, Settings, Mic, MicOff } from "lucide-react";
import { useConversation } from "@elevenlabs/react";
import { useMemo } from "react";
import { toast } from "sonner";
import { apiV1 } from "@/lib/api";

function stripGeneratedHeader(filename: string | undefined, content: string | undefined): string {
  if (!content) {
    return "";
  }

  const lines = content.split(/\r?\n/);
  let index = 0;

  // Skip initial blank lines
  while (index < lines.length && lines[index].trim() === "") {
    index++;
  }

  if (index >= lines.length) {
    return "";
  }

  const lowerFilename = filename?.toLowerCase() ?? "";
  const headerLines: string[] = [];
  let cursor = index;
  let consumed = false;

  const captureCommentBlock = () => {
    while (cursor < lines.length && lines[cursor].trim().startsWith("//")) {
      headerLines.push(lines[cursor]);
      cursor++;
    }
    consumed = headerLines.length > 0;
  };

  const captureBlockComment = () => {
    headerLines.push(lines[cursor]);
    cursor++;
    while (cursor < lines.length && !lines[cursor].includes("*/")) {
      headerLines.push(lines[cursor]);
      cursor++;
    }
    if (cursor < lines.length) {
      headerLines.push(lines[cursor]);
      cursor++;
      consumed = true;
    }
  };

  const trimmed = lines[cursor]?.trim() ?? "";
  if (trimmed.startsWith("//")) {
    captureCommentBlock();
  } else if (trimmed.startsWith("/*")) {
    captureBlockComment();
  }

  if (!consumed) {
    return content;
  }

  const headerText = headerLines.join("\n").toLowerCase();
  const shouldStrip =
    (lowerFilename && headerText.includes(lowerFilename)) ||
    headerText.includes("this file") ||
    headerText.includes("script prints") ||
    headerText.includes("basic console log");

  if (!shouldStrip) {
    return content;
  }

  while (cursor < lines.length && lines[cursor].trim() === "") {
    cursor++;
  }

  return lines.slice(cursor).join("\n");
}

type CallPanelProps = {
  onStart: () => void;
  onEnd: () => void;
  isActive: boolean;
  onCodeAction?: (action: any) => void;
  currentFile?: string;
  projectFiles?: Array<{ path: string; content: string }>;
  selectedCode?: string;
  projectId?: string;
  userId?: string;
  isPlaygroundProject?: boolean;
  /** When true, start the voice conversation as soon as the panel is ready (e.g. from builder "Start Voice Call"). */
  autoStartCall?: boolean;
  /** Initial tab when auto-starting; use "call" so user sees Live Call and hears the agent immediately. */
  defaultTab?: "chat" | "call";
  /** Coding model for /chat (groq, openai, claude, gemini, grok). From builder page selection. */
  chatModelId?: string;
  /** Session token for authenticated chat (rewards). */
  sessionToken?: string | null;
  /** Called when pineapples are earned from a chat message. */
  onReward?: (amount: number, newBalance: number) => void;
  /** When true, chat applies code actions automatically and does not show Apply buttons (builder flow). */
  autoApplyCodeActions?: boolean;
  /** When set (e.g. after scaffold ready), send this prompt once in chat then clear. */
  triggerSendPrompt?: string | null;
  /** Called after triggerSendPrompt has been sent. */
  onTriggerSendComplete?: () => void;
  /** When changed, chat reloads messages from localStorage (e.g. after build page saved initial prompt). */
  reloadMessagesKey?: number;
  /** Called when chat response has appliedFiles (file-plan flow) so parent can refresh file list. */
  onFilesApplied?: () => void;
  /** When true (view-only collaborator), chat cannot send messages. */
  builderViewOnly?: boolean;
  /** Builder: initial prompt (project.description) for Chat tab. */
  builderInitialPrompt?: string | null;
  /** Builder: last agent summary for Chat tab. */
  builderAgentSummary?: string | null;
  /** Builder: project status (scaffolding | ready | error) for Chat tab. */
  builderStatus?: string;
};

export function CallPanel({
  onStart,
  onEnd,
  isActive,
  onCodeAction,
  currentFile,
  projectFiles,
  selectedCode,
  projectId,
  userId,
  isPlaygroundProject,
  autoStartCall = false,
  defaultTab = "chat",
  chatModelId,
  sessionToken,
  onReward,
  autoApplyCodeActions = false,
  triggerSendPrompt,
  onTriggerSendComplete,
  reloadMessagesKey,
  onFilesApplied,
  builderViewOnly = false,
  builderInitialPrompt,
  builderAgentSummary,
  builderStatus,
}: CallPanelProps) {
  const [orbType, setOrbType] = React.useState("shader");
  const [selectedMic, setSelectedMic] = React.useState<string>("");
  const [isMuted, setIsMuted] = React.useState(true); // Start muted by default
  const [selectedVoice, setSelectedVoice] = React.useState<string>("");
  const [voices, setVoices] = React.useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"chat" | "call">(defaultTab);
  const autoStartTriggeredRef = React.useRef(false);
  const previewMicStreamRef = React.useRef<MediaStream | null>(null);
  const [showPreviewWaveform, setShowPreviewWaveform] = React.useState(false);
  const [previewMicEnabled, setPreviewMicEnabled] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const sessionOverrides = React.useMemo(
    () => (selectedVoice ? { tts: { voiceId: selectedVoice } } : undefined),
    [selectedVoice]
  );
  const conversationUserId = React.useMemo(() => userId || projectId || "anonymous", [userId, projectId]);
  const isLocalProject = React.useMemo(() => {
    if (isPlaygroundProject) return true;
    if (!projectId) return false;
    return projectId.startsWith("playground-");
  }, [projectId, isPlaygroundProject]);

  const handleVoiceSelection = React.useCallback(
    async (voiceId: string) => {
      if (voiceId === selectedVoice) {
        return;
      }

      const previousVoice = selectedVoice;
      setSelectedVoice(voiceId);

      if (!voiceId) {
        return;
      }

      try {
        const response = await fetch(apiV1("/voices/select"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceId }),
        });

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          const message =
            errorPayload?.error ||
            errorPayload?.message ||
            `Failed to update voice: ${response.statusText}`;
          throw new Error(message);
        }

        toast.success("Voice preference updated with ElevenLabs.");
      } catch (error) {
        console.error("Failed to update ElevenLabs voice:", error);
        setSelectedVoice(previousVoice);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update voice. Reverting to previous selection.",
        );
      }
    },
    [selectedVoice],
  );
  
  const clientTools = useMemo(() => ({
      generateCode: async ({ request, language, context }: { request: string; language: string; context?: string }): Promise<any> => {
        try {
          console.log('[Client Tool] generateCode called:', { request: request.substring(0, 50) + '...', language, hasContext: !!context });
          
          // Create a unique thread ID for this generation request
          const threadId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
          
          const response = await fetch(apiV1("/chat"), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              threadId,
              prompt: `${request}\n\nLanguage: ${language}${context ? `\n\nAdditional context: ${context}` : ''}`,
              ...(chatModelId ? { model: chatModelId } : {}),
              context: {
                projectId,
              },
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('[Client Tool] generateCode API error:', errorText);
            throw new Error(`Failed to generate code: ${response.statusText}`);
          }

          const data = await response.json();
          
          // Extract code from the first code action, or use the message as fallback
          const codeAction = data.codeActions?.[0];
          const rawCode = codeAction?.content || '';
          const filename = codeAction?.path || `main.${language === 'typescript' ? 'ts' : language === 'javascript' ? 'js' : language}`;
          const code = stripGeneratedHeader(filename, rawCode);
          const description = codeAction?.description || data.message || 'Generated code';

          console.log('[Client Tool] generateCode success:', { filename, codeLength: code.length });
          
          return {
            success: true,
            code,
            language,
            filename,
            description,
          };
        } catch (error) {
          console.error('[Client Tool] Error generating code:', error);
          // Always return a response - never throw, to prevent disconnection
          return {
            success: false,
            code: '',
            language: language || 'javascript',
            filename: '',
            description: error instanceof Error ? error.message : 'Failed to generate code',
          };
        }
      },

      // Create a new file
      createFile: async ({ filename, content }: { filename: string; content: string }): Promise<any> => {
        try {
          if (isLocalProject) {
            const sanitizedContent = stripGeneratedHeader(filename, content);
            onCodeAction?.({
              type: 'create',
              path: filename,
              content: sanitizedContent,
              description: 'Created via voice assistant',
            });
            return {
              success: true,
              message: `File ${filename} created successfully`,
            };
          }

          if (!projectId) {
            throw new Error('Project ID is required');
          }

          const sanitizedContent = stripGeneratedHeader(filename, content);

          const response = await fetch(apiV1("/files"), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'create',
              path: filename,
              content: sanitizedContent,
              projectId,
              ...(userId ? { userId } : {}),
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to create file: ${response.statusText}`);
          }

          const data = await response.json();
          onCodeAction?.({
            type: 'create',
            path: filename,
            content: sanitizedContent,
            description: 'Created via voice assistant',
          });
          return {
            success: true,
            message: `File ${filename} created successfully`,
            id: data.id,
          };
        } catch (error) {
          console.error('Error creating file:', error);
          return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to create file',
          };
        }
      },

      // Update an existing file
      updateFile: async ({ filename, content }: { filename: string; content: string }): Promise<any> => {
        try {
          if (isLocalProject) {
            const sanitizedContent = stripGeneratedHeader(filename, content);
            onCodeAction?.({
              type: 'update',
              path: filename,
              content: sanitizedContent,
              description: 'Updated via voice assistant',
            });
            return {
              success: true,
              message: `File ${filename} updated successfully`,
            };
          }

          if (!projectId) {
            throw new Error('Project ID is required');
          }

          const sanitizedContent = stripGeneratedHeader(filename, content);

          const response = await fetch(apiV1("/files"), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update',
              path: filename,
              content: sanitizedContent,
              projectId,
              ...(userId ? { userId } : {}),
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to update file: ${response.statusText}`);
          }

          const data = await response.json();
          onCodeAction?.({
            type: 'update',
            path: filename,
            content: sanitizedContent,
            description: 'Updated via voice assistant',
          });
          return {
            success: true,
            message: `File ${filename} updated successfully`,
            id: data.id,
          };
        } catch (error) {
          console.error('Error updating file:', error);
          return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to update file',
          };
        }
      },

      // Delete a file
      deleteFile: async ({ filename }: { filename: string }): Promise<any> => {
        try {
          if (isLocalProject) {
            onCodeAction?.({
              type: 'delete',
              path: filename,
              description: 'Deleted via voice assistant',
            });
            return {
              success: true,
              message: `File ${filename} deleted successfully`,
            };
          }

          if (!projectId) {
            throw new Error('Project ID is required');
          }

          const response = await fetch(apiV1("/files"), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'delete',
              path: filename,
              projectId,
              ...(userId ? { userId } : {}),
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to delete file: ${response.statusText}`);
          }

          onCodeAction?.({
            type: 'delete',
            path: filename,
            description: 'Deleted via voice assistant',
          });
          return {
            success: true,
            message: `File ${filename} deleted successfully`,
          };
        } catch (error) {
          console.error('Error deleting file:', error);
          return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to delete file',
          };
        }
      },

      // Get project files or read a specific file
      getProjectFiles: async ({ path }: { path?: string }): Promise<any> => {
        try {
          if (!projectId) {
            throw new Error('Project ID is required');
          }

          // For both playground and authenticated projects, fetch from database
          const url = apiV1(`/files?projectId=${encodeURIComponent(projectId)}${userId && !isLocalProject ? `&userId=${encodeURIComponent(userId)}` : ''}${path ? `&path=${encodeURIComponent(path)}` : ''}`);
          const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to get files: ${response.statusText}`);
          }

          const data = await response.json();
          
          // If a specific path was requested, return just that file
          if (path) {
            const file = data.files?.find((f: any) => f.path === path && !f.isFolder);
            if (file) {
              return {
                success: true,
                files: [file],
                content: file.content,
                path: file.path,
              };
            }
            return {
              success: false,
              message: `File ${path} not found`,
            };
          }

          // Return all files (filter out folders)
          const files = (data.files || []).filter((f: any) => !f.isFolder);
          return {
            success: true,
            files,
            count: files.length,
          };
        } catch (error) {
          console.error('Error getting project files:', error);
          // Fallback to in-memory files if database fetch fails
          if (isLocalProject && projectFiles) {
            const files = projectFiles || [];
            if (path) {
              const file = files.find((f) => f.path === path);
              if (file) {
                return {
                  success: true,
                  files: [file],
                  content: file.content,
                  path: file.path,
                };
              }
            }
            return {
              success: true,
              files,
              count: files.length,
            };
          }
          return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to get project files',
            files: [],
          };
        }
      },
  }), [projectId, userId, onCodeAction, isLocalProject, projectFiles]); // Recreate if project or user context or handler changes

  // Track if we're currently connecting to avoid race conditions
  const isConnectingRef = React.useRef(false);
  
  // Track connection metadata for fallback logic
  const connectionMetadataRef = React.useRef<{
    startTime?: number;
    connectionType?: 'websocket' | 'webrtc';
    disconnectionCount?: number;
  }>({});
  
  const conversation = useConversation({
    onConnect: () => {
      console.log('ElevenLabs: Connected successfully');
      isConnectingRef.current = false;
      // Track when connection started
      connectionMetadataRef.current.startTime = Date.now();
      onStart();
    },
    onDisconnect: () => {
      console.log('ElevenLabs: Disconnected');
      isConnectingRef.current = false;
      
      // Check if this was a premature disconnection
      const metadata = connectionMetadataRef.current;
      if (metadata.startTime) {
        const connectionDuration = Date.now() - metadata.startTime;
        const wasPremature = connectionDuration < 10000; // Less than 10 seconds
        
        console.log(`Connection duration: ${connectionDuration}ms, was premature: ${wasPremature}`);
        
        if (wasPremature && metadata.connectionType) {
          // Increment disconnection count
          metadata.disconnectionCount = (metadata.disconnectionCount || 0) + 1;
          
          console.warn(`Premature disconnection detected (${connectionDuration}ms). Disconnection count: ${metadata.disconnectionCount}`);
          console.warn(`Connection type used: ${metadata.connectionType}`);
          
          // Reset metadata for next attempt
          metadata.startTime = undefined;
        } else {
          // Normal disconnection, reset all tracking
          connectionMetadataRef.current = {};
        }
      }
      
      // Reset mic to initial muted state when call ends
      setIsMuted(true);
      // Don't stop preview mic - keep it running if it was enabled
      onEnd();
    },
    onMessage: (message) => {
      console.log('ElevenLabs Message:', message);
    },
    onError: (error: any) => {
      console.error('ElevenLabs Error:', error);
      // Log more details about the error
      if (error?.message) {
        console.error('Error message:', error.message);
      }
      if (error?.clientToolName) {
        console.error('Client tool error:', error.clientToolName);
      }
      if (error?.stack) {
        console.error('Error stack:', error.stack);
      }
      if (error?.code) {
        console.error('Error code:', error.code);
      }
      if (error?.type) {
        console.error('Error type:', error.type);
      }
      // Log the full error object for debugging
      console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      
      // Check if this is a critical error that would cause disconnection
      const errorMessage = error?.message?.toLowerCase() || '';
      if (errorMessage.includes('websocket') || errorMessage.includes('connection') || errorMessage.includes('closed')) {
        console.error('Connection error detected - this may cause disconnection');
      }
      
      // Only log the error, the conversation should continue
    },
    clientTools,
    ...(sessionOverrides ? { overrides: sessionOverrides } : {}),
  });

  // Fetch voices on mount; 501 or failure => empty list (no console noise)
  React.useEffect(() => {
    const fetchVoices = async () => {
      setLoadingVoices(true);
      try {
        const response = await fetch(apiV1("/voices"));
        if (response.ok) {
          const data = await response.json();
          setVoices(data.voices || []);
        } else {
          setVoices([]);
        }
      } catch {
        setVoices([]);
      } finally {
        setLoadingVoices(false);
      }
    };
    fetchVoices();
  }, []);

  // Initialize/cleanup mic preview stream based on user toggle
  React.useEffect(() => {
    if (previewMicEnabled) {
      const initPreviewMic = async () => {
        try {
          const constraints: MediaStreamConstraints = {
            audio: {
              ...(selectedMic ? { deviceId: { exact: selectedMic } } : {}),
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000, // Higher quality sample rate
            },
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          previewMicStreamRef.current = stream;
          setShowPreviewWaveform(true);
        } catch (error) {
          console.error('Failed to initialize preview mic:', error);
          setShowPreviewWaveform(false);
          setPreviewMicEnabled(false);
        }
      };
      initPreviewMic();
    } else {
      if (previewMicStreamRef.current) {
        previewMicStreamRef.current.getTracks().forEach(track => track.stop());
        previewMicStreamRef.current = null;
        setShowPreviewWaveform(false);
      }
    }

    return () => {
      if (previewMicStreamRef.current) {
        previewMicStreamRef.current.getTracks().forEach(track => track.stop());
        previewMicStreamRef.current = null;
        setShowPreviewWaveform(false);
      }
    };
  }, [previewMicEnabled, selectedMic]);

  // Start conversation handler with automatic fallback between connection types
  const handleStartConversation = React.useCallback(async () => {
    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current || conversation.status === 'connected') {
      console.warn('Already connecting or connected');
      return;
    }

    try {
      isConnectingRef.current = true;
      const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
      if (!agentId) {
        console.error('ElevenLabs Agent ID not configured');
        toast.error('ElevenLabs Agent ID is not configured. Please set NEXT_PUBLIC_ELEVENLABS_AGENT_ID in your environment variables.');
        isConnectingRef.current = false;
        return;
      }

      // Request microphone permission BEFORE starting session (required by ElevenLabs)
      // This ensures permissions are granted and prevents early disconnection
      try {
        const permissionStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          } 
        });
        // Release immediately - ElevenLabs SDK will request its own stream
        permissionStream.getTracks().forEach(track => track.stop());
        console.log('Microphone permission granted');
      } catch (micError: any) {
        console.error('Microphone permission denied:', micError);
        toast.error('Microphone access is required for voice conversations. Please grant permission and try again.');
        isConnectingRef.current = false;
        return;
      }

      // Determine which connection type to try based on previous failures
      const metadata = connectionMetadataRef.current;
      let connectionType: 'websocket' | 'webrtc' = 'websocket'; // Default to websocket
      
      // If we had a premature disconnection, switch connection types
      if (metadata.disconnectionCount && metadata.disconnectionCount > 0) {
        // Switch to the other connection type
        connectionType = metadata.connectionType === 'websocket' ? 'webrtc' : 'websocket';
        console.log(`🔄 Switching connection type from ${metadata.connectionType} to ${connectionType} due to previous premature disconnection`);
      } else if (metadata.connectionType) {
        // Use the last successful connection type
        connectionType = metadata.connectionType;
        console.log(`Using previously successful connection type: ${connectionType}`);
      }
      
      // Store which connection type we're trying
      metadata.connectionType = connectionType;
      
      console.log(`Starting ${connectionType} connection...`);
      try {
        const sessionResult = await conversation.startSession({
          agentId: agentId,
          connectionType: connectionType,
          userId: conversationUserId,
          ...(sessionOverrides ? { overrides: sessionOverrides } : {}),
        });
        console.log('startSession returned:', sessionResult);
        
        // Don't wait - let onConnect handle the success state
        // The connection happens asynchronously
      } catch (connectionError: any) {
        console.error(`${connectionType} connection failed:`, connectionError);
        console.error('Error details:', {
          message: connectionError?.message,
          stack: connectionError?.stack,
          name: connectionError?.name,
          code: connectionError?.code,
        });
        
        // Try to clean up any partial session
        try {
          await conversation.endSession();
        } catch (cleanupError) {
          console.warn('Failed to clean up session:', cleanupError);
        }
        
        // If one connection type fails completely, try the other
        const fallbackType = connectionType === 'websocket' ? 'webrtc' : 'websocket';
        console.log(`🔄 Trying fallback connection type: ${fallbackType}`);
        
        try {
          metadata.connectionType = fallbackType;
          const fallbackResult = await conversation.startSession({
            agentId: agentId,
            connectionType: fallbackType,
            userId: conversationUserId,
            ...(sessionOverrides ? { overrides: sessionOverrides } : {}),
          });
          console.log('Fallback connection succeeded:', fallbackResult);
        } catch (fallbackError: any) {
          console.error(`Fallback ${fallbackType} connection also failed:`, fallbackError);
          
          // Clean up fallback attempt
          try {
            await conversation.endSession();
          } catch (cleanupError) {
            console.warn('Failed to clean up fallback session:', cleanupError);
          }
          
          isConnectingRef.current = false;
          const errorMessage = fallbackError?.message || connectionError?.message || 'Unknown error';
          toast.error(`Failed to start conversation with both connection types. Error: ${errorMessage}. Please check your internet connection and try again.`);
          throw fallbackError;
        }
      }
    } catch (error: any) {
      console.error('Failed to start conversation:', error);
      isConnectingRef.current = false;
      const errorMessage = error?.message || 'Unknown error';
      toast.error(`Failed to start conversation: ${errorMessage}. Please check your internet connection and try again.`);
    }
  }, [conversation, projectId, selectedMic, isMuted, sessionOverrides, conversationUserId]);

  // End conversation handler
  const handleEndConversation = React.useCallback(async () => {
    try {
      await conversation.endSession();
    } catch (error) {
      console.error('Failed to end conversation:', error);
    }
  }, [conversation]);

  // Cleanup on unmount
  React.useEffect(() => {
    // No cleanup needed anymore since we don't manage audio streams
    return () => {};
  }, []);

  // Use conversation status for isActive
  const conversationActive = conversation.status === 'connected';

  // Auto-start voice call when requested (e.g. builder page "Start Voice Call" – start immediately, agent speaks from onset)
  React.useEffect(() => {
    if (!autoStartCall || autoStartTriggeredRef.current || conversation.status === "connected") return;
    autoStartTriggeredRef.current = true;
    setActiveTab("call");
    handleStartConversation();
  }, [autoStartCall, conversation.status, handleStartConversation]);

  return (
    <Card className="h-full min-h-0 flex flex-col w-full bg-card border shadow-sm">
      <CardHeader className="shrink-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>AI Assistant</CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary">Orb: {orbType.startsWith("video") ? "Video" : "Reactive"}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setOrbType("shader")}>Reactive Orb</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOrbType("video:purple")}>Purple Orb (video)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOrbType("video:dusty")}>Dusty Stars (video)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOrbType("video:particle")}>Particle Lit (video)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOrbType("video:golden")}>Golden Yellow (video)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "chat" | "call")} className="h-full flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Text Chat
            </TabsTrigger>
            <TabsTrigger value="call" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Live Call
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="flex-1 min-h-0 m-0 overflow-hidden flex flex-col data-[state=inactive]:hidden">
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
            <ChatPanel
              onCodeAction={onCodeAction || (() => {})}
              currentFile={currentFile}
              projectFiles={projectFiles}
              selectedCode={selectedCode}
              projectId={projectId}
              autoApplyCodeActions={autoApplyCodeActions}
              builderFilesToken={autoApplyCodeActions ? sessionToken : undefined}
              chatModelId={chatModelId}
              sessionToken={sessionToken}
              onReward={onReward}
              triggerSendPrompt={triggerSendPrompt}
              onTriggerSendComplete={onTriggerSendComplete}
              reloadMessagesKey={reloadMessagesKey}
              onFilesApplied={onFilesApplied}
              builderViewOnly={builderViewOnly}
              builderInitialPrompt={builderInitialPrompt}
              builderAgentSummary={builderAgentSummary}
              builderStatus={builderStatus}
            />
            </div>
          </TabsContent>
          <TabsContent value="call" className="flex-1 min-h-0 m-0 overflow-hidden data-[state=inactive]:hidden">
            <div className="p-4 h-full flex flex-col">
              <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                <div className="w-full flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <DropdownMenu open={settingsOpen} onOpenChange={setSettingsOpen}>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                          <Settings className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-64">
                        <div className="p-2 space-y-2">
                          <div className="text-xs font-medium text-muted-foreground mb-1">Microphone</div>
                          <MicSelector
                            value={selectedMic}
                            onValueChange={setSelectedMic}
                            muted={isMuted}
                            onMutedChange={setIsMuted}
                            disabled={conversation.status === 'connecting'}
                          />
                          {loadingVoices ? (
                            <div className="text-xs text-muted-foreground text-center py-2">
                              Loading voices...
                            </div>
                          ) : voices.length > 0 ? (
                            <>
                              <div className="text-xs font-medium text-muted-foreground mb-1 mt-3">Voice</div>
                              <VoicePicker
                                voices={voices}
                                value={selectedVoice}
                                onValueChange={handleVoiceSelection}
                                placeholder="Select voice (optional)"
                              />
                            </>
                          ) : null}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <span className="text-sm text-muted-foreground">Voice conversation</span>
                  </div>
                </div>
                <div className="mx-auto rounded-full overflow-hidden" style={{ height: 240, width: 240, aspectRatio: '1/1' }}>
                  {orbType === "shader" ? (
                    <Orb hoverIntensity={0.5} rotateOnHover={true} hue={0} forceHoverState={conversation.isSpeaking || false} audioLevel={0} />
                  ) : orbType === "video:purple" ? (
                    <VideoOrb src="/orbs/purple-orb.mp4" />
                  ) : orbType === "video:dusty" ? (
                    <VideoOrb src="/orbs/dusty-stars-orb.mp4" />
                  ) : orbType === "video:particle" ? (
                    <VideoOrb src="/orbs/particle-lit-orb.mp4" />
                  ) : (
                    <VideoOrb src="/orbs/golden-yello-ord.mp4" />
                  )}
                </div>
                
                {/* Preview waveform - shows when not in call */}
                {!conversationActive && (
                  <div className="w-full max-w-xs">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewMicEnabled(!previewMicEnabled)}
                        className="h-8 w-8 p-0"
                        title={previewMicEnabled ? "Disable mic preview" : "Enable mic preview"}
                      >
                        {previewMicEnabled ? (
                          <Mic className="h-4 w-4 text-green-500" />
                        ) : (
                          <MicOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                      <span className="text-xs text-muted-foreground">Microphone Preview</span>
                    </div>
                    {previewMicEnabled && showPreviewWaveform ? (
                      <LiveWaveform
                        active={!!previewMicStreamRef.current}
                        stream={previewMicStreamRef.current}
                        mode="static"
                        height={50}
                        barWidth={3}
                        barGap={1}
                        sensitivity={2}
                      />
                    ) : (
                      <div className="h-[50px] w-full border border-dashed border-muted-foreground/20 rounded flex items-center justify-center">
                        <span className="text-xs text-muted-foreground">Click mic icon to enable preview</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Active call waveform - disabled to prevent mic stream conflicts */}
                {/* If needed in future, must use ElevenLabs SDK's internal stream */}

                {/* Controls */}
                <div className="w-full space-y-3">
                  {!conversationActive ? (
                    <Button 
                      onClick={handleStartConversation}
                      disabled={conversation.status === 'connecting'}
                      className="w-full"
                    >
                      {conversation.status === 'connecting' ? 'Connecting...' : 'Start Conversation'}
                    </Button>
                  ) : (
                    <Button 
                      variant="destructive" 
                      onClick={handleEndConversation}
                      className="w-full"
                    >
                      End Conversation
                    </Button>
                  )}
                </div>

                {conversationActive && (
                  <div className="text-sm text-muted-foreground text-center">
                    Status: {conversation.isSpeaking ? 'Agent is speaking...' : isMuted ? 'Muted' : 'Listening...'}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}


