import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";

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

export interface CodeGenerationRequest {
  threadId: string;
  prompt: string;
  context?: {
    currentFile?: string;
    projectFiles?: Array<{ path: string; content: string }>;
    selectedCode?: string;
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
  threadId: string;
}

class AIService {
  private groqModel: ChatGroq;
  private openaiModel: ChatOpenAI;
  private conversations: Map<string, ConversationThread> = new Map();
  private useGroq: boolean = true;

  constructor() {
    // Initialize Groq (free tier)
    this.groqModel = new ChatGroq({
      model: `${process.env.GROQ_MODEL}`,
      temperature: 0.1,
      apiKey: process.env.GROQ_API_KEY,
    });

    // Initialize OpenAI (when credits available)
    this.openaiModel = new ChatOpenAI({
      model: "gpt-4o",
      temperature: 0.1,
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  private getCurrentModel() {
    return this.useGroq ? this.groqModel : this.openaiModel;
  }

  switchToOpenAI() {
    this.useGroq = false;
  }

  switchToGroq() {
    this.useGroq = true;
  }

  createThread(): string {
    const threadId = uuidv4();
    const thread: ConversationThread = {
      id: threadId,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.conversations.set(threadId, thread);
    return threadId;
  }

  getThread(threadId: string): ConversationThread | null {
    return this.conversations.get(threadId) || null;
  }

  private addMessage(threadId: string, role: "human" | "ai" | "system", content: string) {
    const thread = this.conversations.get(threadId);
    if (!thread) return;

    const message: ConversationMessage = {
      id: uuidv4(),
      role,
      content,
      timestamp: Date.now(),
    };

    thread.messages.push(message);
    thread.updatedAt = Date.now();
  }

  async generateCode(request: CodeGenerationRequest): Promise<CodeGenerationResponse> {
    const { threadId, prompt, context } = request;
    
    // Get or create thread
    let thread = this.getThread(threadId);
    if (!thread) {
      const newThreadId = this.createThread();
      thread = this.getThread(newThreadId)!;
    }

    const resolvedProjectFiles = context?.projectFiles ?? [];
    const resolvedContext = { ...context, projectFiles: resolvedProjectFiles } as typeof context;

    // Build context for the AI
    const systemPrompt = this.buildSystemPrompt(resolvedContext);
    const conversationHistory = thread.messages.slice(-10); // Last 10 messages for context

    // Add current file content to context if available
    let enhancedPrompt = prompt;
    if (resolvedContext?.currentFile && resolvedContext?.projectFiles) {
      const currentFileContent = resolvedContext.projectFiles.find(f => f.path === resolvedContext.currentFile);
      if (currentFileContent) {
        enhancedPrompt = `Current file: ${resolvedContext.currentFile}\n\nFile content:\n\`\`\`\n${currentFileContent.content}\n\`\`\`\n\nUser request: ${prompt}`;
      }
    }

    // Prepare messages for LangChain
    const messages = [
      new SystemMessage(systemPrompt),
      ...conversationHistory.map(msg => 
        msg.role === "human" 
          ? new HumanMessage(msg.content)
          : new AIMessage(msg.content)
      ),
      new HumanMessage(enhancedPrompt),
    ];

    const invokeOnce = async () => {
      const model = this.getCurrentModel();
      const response = await model.invoke(messages);
      const aiResponse = typeof response.content === "string" ? response.content : String(response.content);
      // Add messages to thread
      this.addMessage(threadId, "human", prompt);
      this.addMessage(threadId, "ai", aiResponse);
      // Parse code actions from response
      const codeActions = this.parseCodeActions(aiResponse);
      return { message: aiResponse, codeActions, threadId } as CodeGenerationResponse;
    };

    try {
      return await invokeOnce();
    } catch (error: any) {
      const message = (error?.message || "").toString();
      const isToolError = message.includes("tool_use_failed") || message.includes("Tool choice is none");
      if (this.useGroq && isToolError) {
        console.warn("Groq tool_use_failed detected. Retrying with OpenAI...");
        try {
          this.switchToOpenAI();
          return await invokeOnce();
        } catch (retryError) {
          console.error("Retry with OpenAI failed:", retryError);
        } finally {
          // Switch back to Groq for next calls unless explicitly changed elsewhere
          this.switchToGroq();
        }
      }
      console.error("AI generation error:", error);
      throw new Error("Failed to generate code. Please try again.");
    }
  }

  private buildSystemPrompt(context?: CodeGenerationRequest["context"]): string {
    let prompt = `You are VibeCoder, an expert AI coding assistant integrated into a VS Code-like IDE. You help users write, debug, and improve code. When users ask about your identity or name, you should respond that you are VibeCoder, not ChatGPT or any other AI.

IMPORTANT: Do not call tools or functions. Respond in plain text only.

Key capabilities:
- Generate new code files
- Update existing code (make targeted changes, not full rewrites)
- Debug and fix issues
- Refactor code
- Explain code
- Suggest improvements

**UI COMPONENT LIBRARY:**
- For all reusable UI components (buttons, inputs, cards, dialogs, etc.), you MUST use shadcn/ui components
- Import components from "@/components/ui/[component-name]"
- Common components: Button, Input, Card, Dialog, Popover, Select, Textarea, Avatar, Badge, etc.
- Use shadcn/ui's design system and patterns - do NOT create custom components when shadcn equivalents exist
- Follow shadcn/ui's composition patterns and styling conventions

**CRITICAL EDITING GUIDELINES:**
1. When updating existing files, ALWAYS include the COMPLETE file content with your changes applied
2. Do NOT rewrite entire files unless the user explicitly asks for a complete rewrite
3. Make targeted changes: modify only the specific functions, classes, or sections that need updating
4. Preserve existing code structure, imports, comments, and formatting unless they need to change
5. When fixing bugs, identify the specific issue and change only what's necessary
6. Maintain code consistency with the existing codebase style
7. If the file is large, focus on the specific area that needs changes but still provide the complete file
8. Always prefer shadcn/ui components over custom UI implementations

For code actions, use this EXACT format:
\`\`\`action
TYPE: create
PATH: src/example.js
DESCRIPTION: Brief description of what this code does
\`\`\`

\`\`\`javascript
// Your code here
console.log("Hello World");
\`\`\`

For UPDATE actions, you MUST provide the COMPLETE file content with your changes applied. Do not provide partial code or diffs.

**CRITICAL:** Always include BOTH the action block AND the code block. The action block tells the system what to do, and the code block contains the actual code to apply.

Current context:`;

    if (context?.currentFile) {
      prompt += `\n- Current file: ${context.currentFile}`;
      
      // Include current file content if it exists in project files
      if (context.projectFiles) {
        const currentFileData = context.projectFiles.find(f => f.path === context.currentFile);
        if (currentFileData && currentFileData.content) {
          prompt += `\n\nCurrent file content:\n\`\`\`\n${currentFileData.content}\n\`\`\`\n`;
          prompt += `\nIMPORTANT: When updating this file, you must provide the COMPLETE file content with your changes applied. Do not provide partial code.`;
        }
      }
    }

    if (context?.projectFiles && context.projectFiles.length > 0) {
      prompt += `\n- Project files (${context.projectFiles.length} total):\n`;
      context.projectFiles.forEach(file => {
        prompt += `  - ${file.path}${file.content ? ` (${file.content.length} chars)` : ''}\n`;
      });
      
      // Include relevant file contents for context (limit to avoid token limits)
      const relevantFiles = context.projectFiles.filter(f => {
        // Include files that are likely related to the current task
        if (context.currentFile && f.path === context.currentFile) return true;
        // Include files mentioned in the prompt or selected code
        if (context.selectedCode && f.content && f.content.includes(context.selectedCode.substring(0, 50))) return true;
        return false;
      }).slice(0, 3); // Limit to 3 files to avoid token limits
      
      if (relevantFiles.length > 0) {
        prompt += `\nRelevant file contents for context:\n`;
        relevantFiles.forEach(file => {
          if (file.content && file.content.length < 5000) { // Only include files under 5KB
            prompt += `\n--- ${file.path} ---\n\`\`\`\n${file.content.substring(0, 2000)}${file.content.length > 2000 ? '\n... (truncated)' : ''}\n\`\`\`\n`;
          }
        });
      }
    }

    if (context?.projectId) {
      prompt += `\n- Remote project: ${context.projectId}`;
    }

    if (context?.selectedCode) {
      prompt += `\n- Selected code:\n\`\`\`\n${context.selectedCode}\n\`\`\``;
      prompt += `\nNOTE: The user has selected this code. Make changes to this specific section if updating an existing file.`;
    }

    return prompt;
  }

  private parseCodeActions(response: string): CodeGenerationResponse["codeActions"] {
    const actions: CodeGenerationResponse["codeActions"] = [];
    
    console.log("Parsing AI response for code actions:", response.substring(0, 500) + "...");
    
    // More flexible regex patterns - handle different formats
    // Using [\s\S] instead of . with s flag for ES2017 compatibility
    const actionRegex = /```action\s*\nTYPE:\s*(create|update|delete)\s*\nPATH:\s*([\s\S]+?)\s*\nDESCRIPTION:\s*([\s\S]+?)\s*\n```/g;
    const codeRegex = /```(?:javascript|js|typescript|ts|python|py|java|html|css|json|xml|sql|php|go|rust|cpp|c|sh|bash|yaml|yml|markdown|md|text)?\s*\n([\s\S]*?)```/g;
    
    // Also try a simpler pattern as fallback
    const simpleCodeRegex = /```[\s\S]*?\n([\s\S]*?)```/g;

    // Find all action blocks
    const actionMatches = [];
    let actionMatch;
    while ((actionMatch = actionRegex.exec(response)) !== null) {
      actionMatches.push({
        type: actionMatch[1].trim() as "create" | "update" | "delete",
        path: actionMatch[2].trim(),
        description: actionMatch[3].trim(),
      });
    }

    console.log("Found action matches:", actionMatches);

    // Find all code blocks using both patterns
    const codeBlocks: string[] = [];
    
    // Try the main pattern first
    let codeMatch;
    while ((codeMatch = codeRegex.exec(response)) !== null) {
      const content = codeMatch[1].trim();
      console.log("Raw code block content (main):", JSON.stringify(content));
      // Skip action blocks
      if (!content.includes('TYPE:') && !content.includes('PATH:') && !content.includes('DESCRIPTION:')) {
        codeBlocks.push(content);
        console.log("Added code block (main):", content.substring(0, 100) + "...");
      } else {
        console.log("Skipped action block (main):", content.substring(0, 50) + "...");
      }
    }
    
    // If no code blocks found, try the simpler pattern
    if (codeBlocks.length === 0) {
      console.log("No code blocks found with main pattern, trying simple pattern...");
      while ((codeMatch = simpleCodeRegex.exec(response)) !== null) {
        const content = codeMatch[1].trim();
        console.log("Raw code block content (simple):", JSON.stringify(content));
        // Skip action blocks
        if (!content.includes('TYPE:') && !content.includes('PATH:') && !content.includes('DESCRIPTION:')) {
          codeBlocks.push(content);
          console.log("Added code block (simple):", content.substring(0, 100) + "...");
        } else {
          console.log("Skipped action block (simple):", content.substring(0, 50) + "...");
        }
      }
    }

    console.log("Found code blocks:", codeBlocks.map(cb => cb.substring(0, 100) + "..."));

    // Match actions with code blocks - find the code block that comes immediately after each action block
    const actionBlockRegex = /```action[\s\S]*?```/g;
    const allActionBlocks: Array<{ endIndex: number; actionIndex: number }> = [];
    let match;
    let actionIdx = 0;
    while ((match = actionBlockRegex.exec(response)) !== null && actionIdx < actionMatches.length) {
      allActionBlocks.push({
        endIndex: match.index + match[0].length,
        actionIndex: actionIdx++
      });
    }

    // Now find code blocks that come after each action block
    const allCodeMatches: Array<{ startIndex: number; content: string }> = [];
    const codeRegexFull = /```(?:javascript|js|typescript|ts|python|py|java|html|css|json|xml|sql|php|go|rust|cpp|c|sh|bash|yaml|yml|markdown|md|text|action)?\s*\n([\s\S]*?)```/g;
    while ((match = codeRegexFull.exec(response)) !== null) {
      const content = match[1].trim();
      if (!content.includes('TYPE:') && !content.includes('PATH:') && !content.includes('DESCRIPTION:')) {
        allCodeMatches.push({
          startIndex: match.index,
          content: content
        });
      }
    }

    // Match each action with the first code block that comes after it
    actionMatches.forEach((action, index) => {
      const actionBlock = allActionBlocks[index];
      if (!actionBlock) return;
      
      // Find the first code block that starts after this action block ends
      const matchingCodeBlock = allCodeMatches.find(cb => cb.startIndex > actionBlock.endIndex);
      
      if (matchingCodeBlock && matchingCodeBlock.content) {
        actions.push({
          type: action.type,
          path: action.path,
          content: matchingCodeBlock.content,
          description: action.description,
        });
      } else if (codeBlocks[index]) {
        // Fallback to index-based matching
        actions.push({
          type: action.type,
          path: action.path,
          content: codeBlocks[index],
          description: action.description,
        });
      }
    });

    // If we have actions but no code content, try to extract code manually
    if (actions.length > 0 && actions.some(a => !a.content)) {
      console.log("Actions found but missing code content, trying manual extraction...");
      
      // Look for code blocks that come after action blocks
      const actionBlockRegex = /```action[\s\S]*?```/g;
      const codeBlockRegex = /```(?:javascript|js|typescript|ts|python|py|java|html|css|json|xml|sql|php|go|rust|cpp|c|sh|bash|yaml|yml|markdown|md|text)?\s*\n([\s\S]*?)```/g;
      
      // Find all action blocks and their positions
      const actionBlocks: { content: string; endIndex: number }[] = [];
      let match;
      while ((match = actionBlockRegex.exec(response)) !== null) {
        actionBlocks.push({
          content: match[0],
          endIndex: match.index + match[0].length
        });
      }
      
      // Find code blocks that come after action blocks
      const codeBlocksAfterActions: string[] = [];
      while ((match = codeBlockRegex.exec(response)) !== null) {
        const codeContent = match[1].trim();
        if (!codeContent.includes('TYPE:') && !codeContent.includes('PATH:') && !codeContent.includes('DESCRIPTION:')) {
          codeBlocksAfterActions.push(codeContent);
        }
      }
      
      console.log("Found code blocks after actions:", codeBlocksAfterActions);
      
      // Update actions with code content
      actions.forEach((action, index) => {
        if (!action.content && codeBlocksAfterActions[index]) {
          action.content = codeBlocksAfterActions[index];
          const preview = (action.content ?? "").substring(0, 100) + "...";
          console.log(`Updated action ${index} with code:`, preview);
        }
      });
    }

    // If no actions found but we have code blocks, try to infer from context
    if (actions.length === 0 && codeBlocks.length > 0) {
      console.log("No action blocks found, trying to infer from code blocks...");
      
      // Look for file paths in the response
      const pathRegex = /(?:file|path|create|update):\s*([^\s\n]+\.(?:js|ts|jsx|tsx|py|java|html|css|json|xml|sql|php|go|rust|cpp|c|sh|bash|yaml|yml|md|txt))/gi;
      const pathMatches = response.match(pathRegex);
      
      if (pathMatches && pathMatches.length > 0) {
        const filePath = pathMatches[0].replace(/(?:file|path|create|update):\s*/i, '');
        actions.push({
          type: "create",
          path: filePath,
          content: codeBlocks[0],
          description: "Generated code file",
        });
      }
    }

    console.log("Final parsed actions:", actions);
    return actions;
  }

  async getConversationHistory(threadId: string): Promise<ConversationMessage[]> {
    const thread = this.getThread(threadId);
    return thread?.messages || [];
  }
}

// Singleton instance
export const aiService = new AIService();
