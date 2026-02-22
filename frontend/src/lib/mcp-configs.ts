export type MCPTransport = "SSE" | "STREAMABLE_HTTP";
export type MCPApprovalPolicy = "auto_approve_all" | "require_approval_all" | "require_approval_per_tool";

export interface McpPreset {
  id: string;
  label: string;
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  transport?: MCPTransport;
  approvalPolicy?: MCPApprovalPolicy;
  description?: string;
  forcePreToolSpeech?: boolean;
  disableInterruptions?: boolean;
}

export const defaultMcpConfigs: McpPreset[] = [
  {
    id: "github",
    label: "GitHub (official)",
    name: "GitHub MCP",
    url: "https://mcp.github.com/mcp",
    transport: "SSE",
    approvalPolicy: "require_approval_per_tool",
    description:
      "Read repositories, inspect pull requests, create issues, and query CI status using the official GitHub MCP.",
    forcePreToolSpeech: false,
    disableInterruptions: false,
  },
  {
    id: "mdn",
    label: "MDN Web Docs",
    name: "MDN Docs MCP",
    url: "https://mdn-api.mcp.xyz/mcp",
    transport: "SSE",
    approvalPolicy: "auto_approve_all",
    description:
      "Access Mozilla Developer Network documentation for HTML, CSS, and browser APIs. Great for front-end work.",
    forcePreToolSpeech: false,
    disableInterruptions: false,
  },
  {
    id: "react",
    label: "React Docs",
    name: "React Docs MCP",
    url: "https://react-docs.alpha.mcp.cafe/mcp",
    transport: "SSE",
    approvalPolicy: "auto_approve_all",
    description:
      "Query the latest official React documentation, including hooks, Server Components, and React 19 updates.",
    forcePreToolSpeech: false,
    disableInterruptions: false,
  },
  {
    id: "nextjs",
    label: "Next.js Docs",
    name: "Next.js Docs MCP",
    url: "https://nextjs.org/_mcp/server",
    transport: "SSE",
    approvalPolicy: "auto_approve_all",
    description:
      "Access official Next.js documentation including App Router, Cache Components, builds, and deployment guides.",
    forcePreToolSpeech: false,
    disableInterruptions: false,
  },
  {
    id: "figma",
    label: "Figma",
    name: "Figma MCP",
    url: "https://mcp.figma.com/mcp",
    transport: "SSE",
    approvalPolicy: "require_approval_all",
    description: "Interact with Figma files and pull design context directly from the workspace.",
    forcePreToolSpeech: false,
    disableInterruptions: false,
  },
  {
    id: "reown",
    label: "Reown Docs",
    name: "Reown Docs MCP",
    url: "https://docs.reown.com/mcp",
    transport: "SSE",
    approvalPolicy: "auto_approve_all",
    description: "Official Reown documentation for protocols, SDK usage, and integration patterns.",
    forcePreToolSpeech: false,
    disableInterruptions: false,
  },
  {
    id: "zapier",
    label: "Zapier Actions",
    name: "Zapier MCP",
    url: "https://actions.zapier.com/mcp/sk-ak-7xxuIzIfnTy7ncSOUyPEY0a1s6/sse",
    transport: "SSE",
    approvalPolicy: "require_approval_per_tool",
    description: "Trigger Zapier actions and automate workflows from the agent.",
    forcePreToolSpeech: false,
    disableInterruptions: false,
  },
  {
    id: "langchain-docs",
    label: "Docs by LangChain",
    name: "Docs by LangChain MCP",
    url: "https://docs.langchain.com/mcp",
    transport: "SSE",
    approvalPolicy: "auto_approve_all",
    description: "Browse LangChain documentation, components, and cookbook recipes.",
    forcePreToolSpeech: false,
    disableInterruptions: false,
  },
  {
    id: "context7",
    label: "Context7",
    name: "Context7 MCP",
    url: "https://mcp.context7.com/mcp",
    transport: "SSE",
    approvalPolicy: "auto_approve_all",
    description: "Query curated documentation sets via Context7’s library of technical references.",
    forcePreToolSpeech: false,
    disableInterruptions: false,
  },
  {
    id: "supabase",
    label: "Supabase Docs",
    name: "Supabase MCP",
    url: "https://mcp.supabase.com/mcp",
    transport: "SSE",
    approvalPolicy: "auto_approve_all",
    description: "Official Supabase documentation for Auth, Database, Storage, and Edge functions.",
    forcePreToolSpeech: false,
    disableInterruptions: false,
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    name: "elevenlabs.io MCP",
    url: "https://elevenlabs.io/_mcp/server",
    transport: "SSE",
    approvalPolicy: "require_approval_all",
    description: "Interact with ElevenLabs account resources, agents, and tools via the official MCP.",
    forcePreToolSpeech: false,
    disableInterruptions: false,
  },
];

