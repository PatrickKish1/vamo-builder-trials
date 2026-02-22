"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toolsConfig } from "@/lib/tools-config";
import { defaultMcpConfigs, type McpPreset } from "@/lib/mcp-configs";
import { CheckCircle2, Loader2 } from "lucide-react";
import { apiV1 } from "@/lib/api";

interface ExistingTool {
  id: string;
  tool_config: {
    name: string;
    type: string;
    description: string;
  };
  access_info: {
    is_creator: boolean;
    creator_name: string;
    creator_email: string;
    role: string;
  };
  usage_stats: {
    total_calls: number;
    avg_latency_secs: number;
  };
}

interface MCPServer {
  id: string;
  config: {
    name: string;
    url: string;
    transport: string;
    approval_policy?: string;
    description?: string | null;
    force_pre_tool_speech?: boolean | null;
    disable_interruptions?: boolean | null;
  };
  metadata?: {
    created_at: number;
  };
}

type MCPApprovalPolicy = "auto_approve_all" | "require_approval_all" | "require_approval_per_tool";
type MCPTransport = "SSE" | "STREAMABLE_HTTP";

export default function ToolsPage() {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [existingTools, setExistingTools] = useState<ExistingTool[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [loadingMcp, setLoadingMcp] = useState(false);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [creatingMcp, setCreatingMcp] = useState(false);
  const [mcpResult, setMcpResult] = useState<{ success: boolean; message: string } | null>(null);
  const [newMcpConfig, setNewMcpConfig] = useState<{
    name: string;
    url: string;
    transport: MCPTransport;
    approvalPolicy: MCPApprovalPolicy;
    description: string;
    secretToken: string;
    forcePreToolSpeech: boolean;
    disableInterruptions: boolean;
  }>({
    name: "",
    url: "",
    transport: "SSE",
    approvalPolicy: "auto_approve_all",
    description: "",
    secretToken: "",
    forcePreToolSpeech: false,
    disableInterruptions: false,
  });

  const fetchMcpServers = useCallback(async () => {
    if (!apiKey.trim()) {
      setMcpServers([]);
      return;
    }

    setLoadingMcp(true);
    setMcpError(null);

    try {
      const response = await fetch(apiV1("/mcp/list"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMcpServers(data.data?.mcp_servers || []);
      } else {
        setMcpError(data.error || "Failed to fetch MCP servers");
        setMcpServers([]);
      }
    } catch (error) {
      setMcpError(`Failed to fetch MCP servers: ${error instanceof Error ? error.message : String(error)}`);
      setMcpServers([]);
    } finally {
      setLoadingMcp(false);
    }
  }, [apiKey]);

  const fetchExistingTools = useCallback(async () => {
    if (!apiKey.trim()) {
      setExistingTools([]);
      setMcpServers([]);
      return;
    }

    setLoadingTools(true);
    setToolsError(null);

    try {
      const response = await fetch(apiV1("/tools/list"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setExistingTools(data.data?.tools || []);
      } else {
        setToolsError(data.error || "Failed to fetch tools");
        setExistingTools([]);
      }
    } catch (error) {
      setToolsError(`Failed to fetch tools: ${error instanceof Error ? error.message : String(error)}`);
      setExistingTools([]);
    } finally {
      setLoadingTools(false);
    }

    await fetchMcpServers();
  }, [apiKey, fetchMcpServers]);

  // Check if a tool already exists by name
  const isToolExisting = useMemo(() => {
    const toolNameMap: Record<string, boolean> = {};
    existingTools.forEach((tool) => {
      toolNameMap[tool.tool_config.name] = true;
    });
    return toolNameMap;
  }, [existingTools]);

  const handleCreateTool = async (toolId: string, toolConfig: any) => {
    if (!apiKey.trim()) {
      setResults((prev) => ({
        ...prev,
        [toolId]: {
          success: false,
          message: "Please enter your ElevenLabs API key first",
        },
      }));
      return;
    }

    setLoading((prev) => ({ ...prev, [toolId]: true }));
    setResults((prev) => ({ ...prev, [toolId]: { success: false, message: "" } }));

    try {
      const response = await fetch(apiV1("/tools/create"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          toolConfig,
          apiKey,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setResults((prev) => ({
          ...prev,
          [toolId]: {
            success: true,
            message: `Tool created successfully! ID: ${data.data?.id || "N/A"}`,
          },
        }));
        // Refresh tools list after successful creation
        await fetchExistingTools();
      } else {
        setResults((prev) => ({
          ...prev,
          [toolId]: {
            success: false,
            message: `Error: ${data.error || "Unknown error"}. ${data.details ? JSON.stringify(data.details, null, 2) : ""}`,
          },
        }));
      }
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [toolId]: {
          success: false,
          message: `Failed to create tool: ${error instanceof Error ? error.message : String(error)}`,
        },
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [toolId]: false }));
    }
  };

  const handleCreateMcpServer = async () => {
    if (!apiKey.trim()) {
      setMcpResult({
        success: false,
        message: "Please enter your ElevenLabs API key first",
      });
      return;
    }

    if (!newMcpConfig.name.trim() || !newMcpConfig.url.trim()) {
      setMcpResult({
        success: false,
        message: "Name and URL are required to create an MCP server",
      });
      return;
    }

    setCreatingMcp(true);
    setMcpResult(null);

    try {
      const payload: Record<string, any> = {
        name: newMcpConfig.name.trim(),
        url: newMcpConfig.url.trim(),
        transport: newMcpConfig.transport,
        approval_policy: newMcpConfig.approvalPolicy,
        force_pre_tool_speech: newMcpConfig.forcePreToolSpeech,
        disable_interruptions: newMcpConfig.disableInterruptions,
      };

      if (newMcpConfig.description.trim()) {
        payload.description = newMcpConfig.description.trim();
      }

      if (newMcpConfig.secretToken.trim()) {
        payload.secret_token = newMcpConfig.secretToken.trim();
      }

      const response = await fetch(apiV1("/mcp/create"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey,
          config: payload,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMcpResult({
          success: true,
          message: `MCP server created successfully! ID: ${data.data?.id || "N/A"}`,
        });
        setNewMcpConfig({
          name: "",
          url: "",
          transport: "SSE",
          approvalPolicy: "auto_approve_all",
          description: "",
          secretToken: "",
          forcePreToolSpeech: false,
          disableInterruptions: false,
        });
        await fetchMcpServers();
      } else {
        setMcpResult({
          success: false,
          message: `Error: ${data.error || "Unknown error"}. ${
            data.details ? JSON.stringify(data.details, null, 2) : ""
          }`,
        });
      }
    } catch (error) {
      setMcpResult({
        success: false,
        message: `Failed to create MCP server: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setCreatingMcp(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">ElevenLabs Tools Manager</h1>
            <p className="text-muted-foreground">
              Create and manage tools for your ElevenLabs agent
            </p>
          </div>
          <Link href="/">
            <Button variant="outline">Back to IDE</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>API Configuration</CardTitle>
            <CardDescription>
              Enter your ElevenLabs API key to create and list tools
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Enter your ElevenLabs API key (xi-api-key)"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="max-w-md"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      fetchExistingTools();
                    }
                  }}
                />
                <Button
                  onClick={fetchExistingTools}
                  disabled={!apiKey.trim() || loadingTools}
                  variant="outline"
                >
                  {loadingTools ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Refresh Tools"
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Your API key is only used to make the request and is not stored
              </p>
              {toolsError && (
                <div className="p-3 rounded-md bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-100 border border-red-200 dark:border-red-800 text-sm">
                  <p className="font-medium">Error fetching tools:</p>
                  <p>{toolsError}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MCP Server Integrations</CardTitle>
            <CardDescription>
              Manage Model Context Protocol servers connected to your ElevenLabs workspace
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={fetchMcpServers}
                disabled={!apiKey.trim() || loadingMcp}
                variant="outline"
              >
                {loadingMcp ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Refresh MCP Servers"
                )}
              </Button>
              <span className="text-xs text-muted-foreground">
                Requires an API key with access to Conversational AI MCP endpoints
              </span>
            </div>

            {mcpError && (
              <div className="p-3 rounded-md bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-100 border border-red-200 dark:border-red-800 text-sm">
                <p className="font-medium">Error fetching MCP servers:</p>
                <p>{mcpError}</p>
              </div>
            )}

            {mcpServers.length > 0 ? (
              <div className="space-y-2">
                {mcpServers.map((server) => (
                  <div
                    key={server.id}
                    className="p-3 rounded-md border bg-muted/50 space-y-2"
                  >
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{server.config.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 font-medium">
                            {server.config.transport}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground break-all">
                          {server.config.url}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Policy: {server.config.approval_policy || "auto_approve_all"}
                      </span>
                    </div>
                    {server.config.description && (
                      <p className="text-sm text-muted-foreground">
                        {server.config.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>ID: {server.id}</span>
                      {typeof server.metadata?.created_at === "number" && (
                        <>
                          <span>•</span>
                          <span>
                            Created: {new Date(server.metadata.created_at * 1000).toLocaleString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !loadingMcp && (
                <p className="text-sm text-muted-foreground">
                  No MCP servers found for this workspace.
                </p>
              )
            )}

            <div className="space-y-4 border-t pt-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Create MCP Server</h3>
                    <p className="text-sm text-muted-foreground">
                      Provide the minimal configuration required to register a new MCP server.
                    </p>
                  </div>
                  {defaultMcpConfigs.length > 0 && (
                    <select
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                      onChange={(event) => {
                        const selected = defaultMcpConfigs.find(
                          (preset: McpPreset) => preset.id === event.target.value,
                        );
                        if (selected) {
                          setNewMcpConfig({
                            name: selected.name,
                            url: selected.url ?? "",
                            transport: selected.transport ?? "SSE",
                            approvalPolicy: selected.approvalPolicy ?? "auto_approve_all",
                            description: selected.description ?? "",
                            secretToken: "",
                            forcePreToolSpeech: selected.forcePreToolSpeech ?? false,
                            disableInterruptions: selected.disableInterruptions ?? false,
                          });
                          setMcpResult(null);
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Quick presets…
                      </option>
                      {defaultMcpConfigs.map((preset: McpPreset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mcp-name">Name</Label>
                  <Input
                    id="mcp-name"
                    placeholder="e.g. GitHub MCP"
                    value={newMcpConfig.name}
                    onChange={(event) =>
                      setNewMcpConfig((prev) => ({ ...prev, name: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcp-url">Server URL</Label>
                  <Input
                    id="mcp-url"
                    placeholder="https://example.com/mcp"
                    value={newMcpConfig.url}
                    onChange={(event) =>
                      setNewMcpConfig((prev) => ({ ...prev, url: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcp-transport">Transport</Label>
                  <select
                    id="mcp-transport"
                    value={newMcpConfig.transport}
                    onChange={(event) =>
                      setNewMcpConfig((prev) => ({
                        ...prev,
                        transport: event.target.value as MCPTransport,
                      }))
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="SSE">SSE</option>
                    <option value="STREAMABLE_HTTP">Streamable HTTP</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcp-approval">Approval Policy</Label>
                  <select
                    id="mcp-approval"
                    value={newMcpConfig.approvalPolicy}
                    onChange={(event) =>
                      setNewMcpConfig((prev) => ({
                        ...prev,
                        approvalPolicy: event.target.value as MCPApprovalPolicy,
                      }))
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="auto_approve_all">Auto approve all</option>
                    <option value="require_approval_all">Require approval (all tools)</option>
                    <option value="require_approval_per_tool">Require approval per tool</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mcp-description">Description (optional)</Label>
                  <Textarea
                    id="mcp-description"
                    placeholder="Short summary of what this MCP server provides"
                    value={newMcpConfig.description}
                    onChange={(event) =>
                      setNewMcpConfig((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mcp-secret">Secret token (optional)</Label>
                  <Input
                    id="mcp-secret"
                    placeholder="Secret token used to authenticate requests"
                    value={newMcpConfig.secretToken}
                    onChange={(event) =>
                      setNewMcpConfig((prev) => ({ ...prev, secretToken: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newMcpConfig.forcePreToolSpeech}
                    onChange={(event) =>
                      setNewMcpConfig((prev) => ({
                        ...prev,
                        forcePreToolSpeech: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border border-input"
                  />
                  <span>Force pre-tool speech</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newMcpConfig.disableInterruptions}
                    onChange={(event) =>
                      setNewMcpConfig((prev) => ({
                        ...prev,
                        disableInterruptions: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border border-input"
                  />
                  <span>Disable interruptions while tools run</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleCreateMcpServer}
                  disabled={
                    creatingMcp ||
                    !apiKey.trim() ||
                    !newMcpConfig.name.trim() ||
                    !newMcpConfig.url.trim()
                  }
                >
                  {creatingMcp ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create MCP Server"
                  )}
                </Button>
                {mcpResult && (
                  <div
                    className={`p-3 rounded-md text-sm ${
                      mcpResult.success
                        ? "bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100 border border-green-200 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-100 border border-red-200 dark:border-red-800"
                    }`}
                  >
                    <p className="font-medium">
                      {mcpResult.success ? "Success" : "Error"}
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap text-xs">
                      {mcpResult.message}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Existing Tools List */}
        {existingTools.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Existing Tools ({existingTools.length})</CardTitle>
              <CardDescription>
                Tools that have already been created in your workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {existingTools.map((tool) => (
                  <div
                    key={tool.id}
                    className="flex items-center justify-between p-3 rounded-md border bg-muted/50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="font-medium">{tool.tool_config.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({tool.tool_config.type})
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {tool.tool_config.description}
                      </p>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span>ID: {tool.id}</span>
                        <span>•</span>
                        <span>Calls: {tool.usage_stats.total_calls}</span>
                        <span>•</span>
                        <span>
                          Creator: {tool.access_info.creator_name || tool.access_info.creator_email}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {toolsConfig.map((tool) => (
            <Card key={tool.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{tool.name}</CardTitle>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-medium">
                        {tool.config.type === "client" ? "CLIENT" : "WEBHOOK"}
                      </span>
                    </div>
                    <CardDescription>{tool.description}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setExpandedTool(expandedTool === tool.id ? null : tool.id)
                      }
                    >
                      {expandedTool === tool.id ? "Hide" : "Show"} JSON
                    </Button>
                    <Button
                      onClick={() => handleCreateTool(tool.id, tool.config)}
                      disabled={
                        loading[tool.id] ||
                        !apiKey.trim() ||
                        isToolExisting[tool.config.name] === true
                      }
                      size="sm"
                      title={
                        isToolExisting[tool.config.name]
                          ? "Tool already exists"
                          : undefined
                      }
                    >
                      {loading[tool.id] ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : isToolExisting[tool.config.name] ? (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Already Created
                        </>
                      ) : (
                        "Create Tool"
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {expandedTool === tool.id && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Tool Configuration JSON</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(tool.config, null, 2));
                        }}
                      >
                        Copy JSON
                      </Button>
                    </div>
                    <Textarea
                      value={JSON.stringify(tool.config, null, 2)}
                      readOnly
                      className="font-mono text-xs min-h-[300px]"
                    />
                  </div>
                )}

                {results[tool.id] && (
                  <div
                    className={`p-3 rounded-md text-sm ${
                      results[tool.id].success
                        ? "bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100 border border-green-200 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-100 border border-red-200 dark:border-red-800"
                    }`}
                  >
                    <p className="font-medium">
                      {results[tool.id].success ? "Success" : "Error"}
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap text-xs">
                      {results[tool.id].message}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

