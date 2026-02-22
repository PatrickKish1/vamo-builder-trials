import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";

export interface ConversationMessage {
  id: string;
  role: "human" | "ai" | "system";
  content: string;
  timestamp: number;
}

export interface ConversationThread {
  id: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
}

export type ChatModelId = "groq" | "openai" | "gemini" | "claude" | "grok";

export interface CodeGenerationRequest {
  threadId: string;
  prompt: string;
  model?: ChatModelId;
  context?: {
    currentFile?: string;
    projectFiles?: Array<{ path: string; content: string }>;
    selectedCode?: string;
    appwriteProjectId?: string;
    projectId?: string;
  };
}

export interface CodeGenerationResponse {
  message: string;
  codeActions?: Array<{
    type: "create" | "update" | "delete";
    path: string;
    content?: string;
    description: string;
  }>;
  filePlan?: FilePlanItem[];
  threadId: string;
}

export interface FilePlanItem {
  path: string;
  action: "create" | "update" | "delete";
  description: string;
}

export interface GenerateFileRequest {
  projectId?: string;
  path: string;
  action: "create" | "update";
  description: string;
  currentContent?: string;
  model?: ChatModelId;
}

let groqModel: ChatGroq | null = null;
let openaiModel: ChatOpenAI | null = null;
let grokModel: ChatOpenAI | null = null;
const conversations = new Map<string, ConversationThread>();

const DEFAULT_MODEL: ChatModelId = "groq";

function getGroqModel(): ChatGroq {
  if (!groqModel) {
    const apiKey = env.groqApiKey;
    if (!apiKey) throw new Error("GROQ_API_KEY is required for chat");
    groqModel = new ChatGroq({
      model: process.env.GROQ_MODEL ?? "llama-3.1-70b-versatile",
      temperature: 0.1,
      apiKey,
    });
  }
  return groqModel;
}

function getOpenAIModel(): ChatOpenAI {
  if (!openaiModel) {
    const apiKey = env.openaiApiKey;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for OpenAI");
    openaiModel = new ChatOpenAI({
      model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o",
      temperature: 0.1,
      apiKey,
    });
  }
  return openaiModel;
}

function getGrokModel(): ChatOpenAI {
  if (!grokModel) {
    const apiKey = env.xaiApiKey;
    if (!apiKey) throw new Error("XAI_API_KEY is required for Grok");
    grokModel = new ChatOpenAI({
      model: process.env.XAI_MODEL ?? "grok-2",
      temperature: 0.1,
      configuration: {
        baseURL: "https://api.x.ai/v1",
        apiKey,
      },
    });
  }
  return grokModel;
}

async function getClaudeModel(): Promise<BaseChatModel> {
  const apiKey = env.anthropicApiKey;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for Claude");
  try {
    const mod = await import("@langchain/anthropic" as string);
    const ChatAnthropic = (mod as { ChatAnthropic: new (config: Record<string, unknown>) => BaseChatModel })
      .ChatAnthropic;
    return new ChatAnthropic({
      model: process.env.ANTHROPIC_CHAT_MODEL ?? "claude-sonnet-4-20250514",
      temperature: 0.1,
      apiKey,
    });
  } catch (e) {
    throw new Error(
      "Claude provider not available. Install @langchain/anthropic and set ANTHROPIC_API_KEY."
    );
  }
}

async function getGeminiModel(): Promise<BaseChatModel> {
  const apiKey = env.googleGenAiApiKey;
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required for Gemini");
  try {
    const mod = await import("@langchain/google-genai" as string);
    const ChatGoogleGenerativeAI = (mod as {
      ChatGoogleGenerativeAI: new (config: Record<string, unknown>) => BaseChatModel;
    }).ChatGoogleGenerativeAI;
    return new ChatGoogleGenerativeAI({
      model: process.env.GEMINI_CHAT_MODEL ?? "gemini-2.0-flash",
      temperature: 0.1,
      apiKey,
    });
  } catch (e) {
    throw new Error(
      "Gemini provider not available. Install @langchain/google-genai and set GOOGLE_GENERATIVE_AI_API_KEY."
    );
  }
}

async function getModelForRequest(modelId?: ChatModelId): Promise<BaseChatModel> {
  const id = modelId ?? DEFAULT_MODEL;
  switch (id) {
    case "openai":
      return getOpenAIModel();
    case "grok":
      return getGrokModel();
    case "claude":
      return getClaudeModel();
    case "gemini":
      return getGeminiModel();
    case "groq":
    default:
      return getGroqModel();
  }
}

export function createThread(): string {
  const threadId = uuidv4();
  const thread: ConversationThread = {
    id: threadId,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  conversations.set(threadId, thread);
  return threadId;
}

export function getThread(threadId: string): ConversationThread | null {
  return conversations.get(threadId) ?? null;
}

function addMessage(
  threadId: string,
  role: "human" | "ai" | "system",
  content: string
): void {
  const thread = conversations.get(threadId);
  if (!thread) return;
  thread.messages.push({
    id: uuidv4(),
    role,
    content,
    timestamp: Date.now(),
  });
  thread.updatedAt = Date.now();
}

const CODING_AGENT_RULES = `
**CODING BEST PRACTICES (always follow):**
- Prefer small, single-purpose functions. No magic numbers; use named constants.
- Use descriptive names; avoid \`any\`; define proper types/interfaces.
- Prefer async/await over raw Promises; do not ignore caught errors or rejected promises.
- Use semantic HTML (article, section, aside, nav) and avoid div soup.
- Ensure accessibility: aria labels, roles, and keyboard/screenreader support where relevant.
- For styling use Tailwind; prefer \`shrink-0\` over \`flex-shrink-0\` (Tailwind v4).

**UI & COMPONENTS:**
- For React/Next.js UI, use shadcn/ui components from \`@/components/ui/*\` (Button, Input, Card, Dialog, Select, etc.) when available; do not reinvent when a shadcn equivalent exists.
- Generate high-level, production-ready UI: clear hierarchy, consistent spacing, and readable typography.
- Prefer composition over custom one-off components when using a design system.

**CRITICAL — EDITING DISCIPLINE (avoid frustrating users):**
- Only edit or create files that are directly required by the user's request. Do not change, refactor, or "improve" other files.
- Do not change UI design, styling, layout, or visuals unless the user explicitly asks for it (e.g. "change the button color", "redesign the header").
- Do not edit files that were not mentioned or clearly implied by the user. If the user says "add a login form to the home page", only touch the file(s) that implement the home page and any new file you create for the form; do not modify unrelated components or global styles.
- When updating a file, make the minimal set of changes needed to fulfill the request. Preserve existing behavior and styling elsewhere in that file.
- Never batch-edit multiple files "for consistency" unless the user asked for a global change.
- **MAIN PAGE FOR LANDING/MARKETING:** For requests like "landing page", "home page", or "main marketing page", edit the app's main page (e.g. \`app/page.tsx\` or \`src/app/page.tsx\`) unless the user explicitly asked for a different route. Do not create a separate route (e.g. \`/landing\`) for the main landing content. If the main page currently has only template/boilerplate from scaffolding, replace it entirely with the requested content; if it already has real project content, make minimal targeted changes only.
- **BUILDER PROJECT (existing scaffold):** When the user is chatting in the context of an existing builder project (projectId in context), do not scaffold or create a new project. Work only within the existing project files. Ensure any file you create or update has full, valid content—never write empty or placeholder-only files.

**FOLLOW-UP REQUESTS (incremental changes):**
- When the user sends a follow-up prompt, focus precisely on that task only. Do not remove, delete, or overwrite files or code unless the user explicitly asked to remove or replace something.
- Prefer "update" over "create" when the target file already exists; only emit "delete" when the user clearly asks to remove a file or feature.
- Preserve all existing files and code that are not required to change for the requested task.

**RESPONSE FORMAT:**
- Always start your reply with a short plain-language summary of what you did (e.g. "I've added the login form to the home page." or "I've updated the button styling."). Then include the code actions and code blocks. This way the user sees a clear task completion message in the chat.
- Keep the written reply minimal and user-friendly: one or two sentences on what was done. Do not include code snippets, technical notes (e.g. "add placeholder images"), or HTML/code details in the message text. Put all code only in the code action blocks.

**PROJECT RULES & PROMPTS (do not edit, only add):**
- Never edit or remove existing system prompts, rules, or instructions that are already in the codebase (e.g. in config files, README, or app guidelines). You may only add new rules or append to them; do not replace or delete existing ones.

**THEME (LIGHT/DARK MODE) — when the user asks for themeable app, light/dark mode, or theme switching:**
- Add a visible theme toggle button (e.g. in the header or layout) that the user can click to switch between light and dark mode.
- The theme must switch instantly on click: update the DOM immediately (e.g. by toggling a class on \`html\` or \`document.documentElement\`, or using \`next-themes\` / \`ThemeProvider\` with client-side state). No full page refresh or navigation.
- The transition should feel fluid: use a short CSS transition on \`color\`, \`background-color\`, or \`theme\` so the change is smooth rather than a hard flash. Prefer \`transition-colors\` or similar so the theme change updates the whole UI in one instant, fluid update when the button is clicked.
`;

function buildSystemPrompt(context?: CodeGenerationRequest["context"]): string {
  let prompt = `You are VibeCoder, an expert AI coding assistant. Help users write, debug, and improve code. Do not call tools. Respond in plain text only.
${CODING_AGENT_RULES}

For code actions use this EXACT format. Every create/update action MUST be followed by a code block containing the full file content.
\`\`\`action
TYPE: create|update|delete
PATH: path/to/file
DESCRIPTION: Brief description
\`\`\`

\`\`\`tsx
// full file content here (required for create/update; use \`\`\`tsx for React/Next.js)
\`\`\`

Use \`\`\`tsx for React/Next.js components and pages so the code is applied correctly. Do not emit create or update without the corresponding code block.

Current context:`;
  if (context?.currentFile) prompt += `\n- Current file: ${context.currentFile}`;
  if (context?.projectFiles?.length) {
    prompt += `\n- Project files: ${context.projectFiles.map((f) => f.path).join(", ")}`;
  }
  if (context?.selectedCode) {
    prompt += `\n- Selected code:\n\`\`\`\n${context.selectedCode}\n\`\`\``;
  }
  if (context?.projectId) {
    prompt += `

**BUILDER PROJECT — USE ONLY FILE_PLAN (do not put code in the chat):**
When changing files in this builder project you MUST use only the FILE_PLAN block. Do not output any \`\`\`action or \`\`\`tsx code blocks in your reply. The system will generate and write code to each file automatically. Your reply must contain:
1. A single short user-facing summary (e.g. "I've updated the main page with the lamp e-commerce landing.").
2. A FILE_PLAN block listing each file to create or update. Use the exact path that exists in the project (see project files list above; e.g. app/page.tsx or src/app/page.tsx).

Format:
FILE_PLAN
PATH: path/to/file
ACTION: create|update|delete
DESCRIPTION: What to do in this file (one line)

PATH: next/file
ACTION: create|update|delete
DESCRIPTION: ...
END_FILE_PLAN

No code in the chat — only the summary and FILE_PLAN.

**To install packages or add shadcn UI components:** If the user asks to fix "Module not found" for @/components/ui/... or to add dependencies, output a single line before your summary:
RUN_COMMAND: <full shell command>
Builder projects run in cloud sandboxes with npm/node pre-installed. Use npm for package management. For one-off CLI tools (e.g. shadcn) use npx.
Examples: RUN_COMMAND: npx shadcn@latest add button card
RUN_COMMAND: npm install tailwindcss classnames
RUN_COMMAND: npm list
Allowed: npm add|install|run, npx, npm list|why|outdated. Then provide the FILE_PLAN for any code changes needed.`;
  }
  return prompt;
}

function parseFilePlan(response: string): FilePlanItem[] {
  const plan: FilePlanItem[] = [];
  const start = response.indexOf("FILE_PLAN");
  const end = response.indexOf("END_FILE_PLAN");
  if (start === -1 || end === -1 || end <= start) return plan;
  const block = response.slice(start + "FILE_PLAN".length, end).trim();
  const pathSections = block.split(/\n(?=PATH:\s*)/i);
  for (const section of pathSections) {
    const pathMatch = section.match(/PATH:\s*([^\n]+)/i);
    const actionMatch = section.match(/ACTION:\s*(create|update|delete)/i);
    const descMatch = section.match(/DESCRIPTION:\s*([\s\S]*?)(?=\n(?:PATH:|$))/i);
    if (pathMatch && actionMatch) {
      const path = pathMatch[1].trim();
      const action = actionMatch[1].trim().toLowerCase() as "create" | "update" | "delete";
      const description = descMatch ? descMatch[1].trim() : "";
      plan.push({ path, action, description });
    }
  }
  return plan;
}

function parseCodeActions(response: string): CodeGenerationResponse["codeActions"] {
  const actions: CodeGenerationResponse["codeActions"] = [];
  const actionRegex = /```action\s*\nTYPE:\s*(create|update|delete)\s*\nPATH:\s*([\s\S]+?)\s*\nDESCRIPTION:\s*([\s\S]+?)\s*\n```/g;
  const codeRegex =
    /```(?:javascript|js|typescript|ts|tsx|jsx|python|py|html|css|json|xml|sh|bash|yaml|yml|md|text)?\s*\n([\s\S]*?)```/g;
  let actionMatch;
  const actionMatches: Array<{ type: "create" | "update" | "delete"; path: string; description: string }> = [];
  while ((actionMatch = actionRegex.exec(response)) !== null) {
    actionMatches.push({
      type: actionMatch[1].trim() as "create" | "update" | "delete",
      path: actionMatch[2].trim(),
      description: actionMatch[3].trim(),
    });
  }
  const codeBlocks: string[] = [];
  let codeMatch;
  while ((codeMatch = codeRegex.exec(response)) !== null) {
    const content = codeMatch[1].trim();
    if (!content.includes("TYPE:") && !content.includes("PATH:") && !content.includes("DESCRIPTION:")) {
      codeBlocks.push(content);
    }
  }
  actionMatches.forEach((action, index) => {
    const content = codeBlocks[index];
    if (action.type === "delete") {
      actions.push({ type: action.type, path: action.path, description: action.description });
      return;
    }
    if (action.type === "create" || action.type === "update") {
      if (content === undefined || content === "") return;
      actions.push({
        type: action.type,
        path: action.path,
        content,
        description: action.description,
      });
    }
  });
  return actions.length ? actions : undefined;
}

export async function generateCode(
  request: CodeGenerationRequest
): Promise<CodeGenerationResponse> {
  const { threadId, prompt, context, model: modelId } = request;
  let thread = getThread(threadId);
  if (!thread) {
    const newId = createThread();
    thread = getThread(newId)!;
  }
  const systemPrompt = buildSystemPrompt(context);
  const history = thread.messages.slice(-10);
  let enhancedPrompt = prompt;
  if (context?.currentFile && context?.projectFiles) {
    const current = context.projectFiles.find((f) => f.path === context.currentFile);
    if (current?.content) {
      enhancedPrompt = `Current file: ${context.currentFile}\n\n\`\`\`\n${current.content}\n\`\`\`\n\nUser request: ${prompt}`;
    }
  }
  const messages = [
    new SystemMessage(systemPrompt),
    ...history.map((msg) =>
      msg.role === "human" ? new HumanMessage(msg.content) : new AIMessage(msg.content)
    ),
    new HumanMessage(enhancedPrompt),
  ];
  const invokeOnce = async (selectedModel: BaseChatModel): Promise<CodeGenerationResponse> => {
    const response = await selectedModel.invoke(messages);
    const aiContent =
      typeof response.content === "string" ? response.content : String(response.content);
    addMessage(threadId, "human", prompt);
    addMessage(threadId, "ai", aiContent);
    const codeActions = parseCodeActions(aiContent);
    const filePlan = parseFilePlan(aiContent);
    return { message: aiContent, codeActions, filePlan: filePlan.length ? filePlan : undefined, threadId };
  };

  try {
    const primaryModel = await getModelForRequest(modelId);
    return await invokeOnce(primaryModel);
  } catch (err) {
    const message = (err as Error)?.message ?? "";
    const usedGroq = (modelId ?? DEFAULT_MODEL) === "groq";
    if (usedGroq && (message.includes("tool_use") || message.includes("Tool choice"))) {
      try {
        return await invokeOnce(getOpenAIModel());
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

export async function getConversationHistory(
  threadId: string
): Promise<ConversationMessage[]> {
  const thread = getThread(threadId);
  return thread?.messages ?? [];
}

const CODE_BLOCK_REGEX =
  /```(?:javascript|js|typescript|ts|tsx|jsx|python|py|html|css|json|xml|sh|bash|yaml|yml|md|text)?\s*\n([\s\S]*?)```/;

export async function generateFileContent(
  request: GenerateFileRequest
): Promise<string> {
  const { path: filePath, action, description, currentContent, model } = request;
  const systemPrompt = `You are a code generator. Output ONLY the complete file content for a single file. No explanation, no markdown outside the code block, no "here is the code". Output exactly one code block with the full file content.

File path: ${filePath}
Action: ${action}
Instructions: ${description}
${action === "update" && currentContent != null && currentContent !== "" ? `\nCurrent file content:\n\`\`\`\n${currentContent}\n\`\`\`\n\nApply the requested changes and output the COMPLETE new file content.` : ""}

Use \`\`\`tsx for React/Next.js .tsx files, \`\`\`typescript for .ts, \`\`\`css for .css. Output the code block only.`;

  const userPrompt =
    action === "update" && currentContent != null && currentContent !== ""
      ? `Update this file according to the instructions. Output the complete new content in a single code block.`
      : `Generate the complete file content. Output a single code block.`;

  const modelInstance = await getModelForRequest(model);
  const response = await modelInstance.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);
  const text = typeof response.content === "string" ? response.content : String(response.content);
  const match = text.match(CODE_BLOCK_REGEX);
  if (match?.[1]) return match[1].trim();
  return text.trim();
}

export async function generateInstantOffer(prompt: string): Promise<string> {
  const apiKey = env.openaiApiKey;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for instant offer");
  const model = new ChatOpenAI({
    openAIApiKey: apiKey,
    modelName: "gpt-4o-mini",
    temperature: 0.4,
  });
  const response = await model.invoke([new HumanMessage(prompt)]);
  const text = typeof response.content === "string" ? response.content : String(response.content);
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) return jsonMatch[1].trim();
  return text.trim();
}

export interface SuggestProjectResult {
  name: string;
  logoPrompt: string;
}

export async function suggestProjectFromPrompt(
  userPrompt: string,
  framework?: string
): Promise<SuggestProjectResult> {
  const apiKey = env.openaiApiKey;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for project suggestion");
  const model = new ChatOpenAI({
    openAIApiKey: apiKey,
    modelName: "gpt-4o-mini",
    temperature: 0.3,
  });
  const systemPrompt = `You are a product naming and branding assistant. Given a short app idea from the user, respond with exactly two things:
1. A concise project name (2-4 words, title case, no special characters, suitable for an app/folder name). Examples: "Task Flow", "SaaS Dashboard", "AI Chat UI".
2. A one-line image description to generate a minimal app logo (e.g. "minimal flat icon for a task list app", "clean SaaS dashboard icon"). Keep it under 15 words.

Respond ONLY with valid JSON in this exact shape, no other text:
{"name": "<project name>", "logoPrompt": "<logo image description>"}`;
  const userMessage = framework
    ? `App idea: ${userPrompt}\nFramework: ${framework}.`
    : `App idea: ${userPrompt}`;
  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userMessage),
  ]);
  const text = typeof response.content === "string" ? response.content : String(response.content);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const raw = jsonMatch ? jsonMatch[0] : text;
  try {
    const parsed = JSON.parse(raw) as { name?: string; logoPrompt?: string };
    const name = typeof parsed.name === "string" && parsed.name.trim()
      ? parsed.name.trim().slice(0, 80)
      : "My App";
    const logoPrompt = typeof parsed.logoPrompt === "string" && parsed.logoPrompt.trim()
      ? parsed.logoPrompt.trim().slice(0, 200)
      : "minimal app logo";
    return { name, logoPrompt };
  } catch {
    return { name: "My App", logoPrompt: "minimal app logo" };
  }
}
