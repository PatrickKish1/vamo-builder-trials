import type { Request, Response } from "express";
import * as chatService from "../services/chat.service.js";
import * as builderService from "../services/builder.service.js";
import * as rewardService from "../services/reward.service.js";
import { getSupabaseClientWithAuth } from "../config/supabase.js";
import { badRequest } from "../utils/errors.js";

type ChatTag = "plan" | "feature" | "customer" | "revenue" | "ask" | null;

const TAG_REWARD_MAP: Partial<Record<NonNullable<ChatTag>, rewardService.RewardEventType>> = {
  feature: "feature_shipped",
  customer: "customer_added",
  revenue: "revenue_logged",
};

function getAccessToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
}

async function logActivityEvent(
  supabase: ReturnType<typeof getSupabaseClientWithAuth>,
  _userId: string,
  projectId: string,
  eventType: string,
  description: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabase.from("builder_projects").select("id").eq("id", projectId).maybeSingle();
    // Log to recent_activity JSONB on the project (append, keep last 50)
    const newEvent = { type: eventType, description, createdAt: new Date().toISOString(), metadata };
    await supabase.rpc("append_activity_event", {
      p_project_id: projectId,
      p_event: newEvent,
    });
  } catch {
    // Non-blocking – do not fail the chat response
  }
}

export async function postChat(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    threadId?: string;
    prompt?: string;
    model?: chatService.ChatModelId;
    context?: chatService.CodeGenerationRequest["context"];
    projectId?: string;
    idempotencyKey?: string;
    tag?: ChatTag;
  };
  if (!body.prompt) throw badRequest("Prompt is required");

  const threadId = body.threadId ?? chatService.createThread();
  const token = getAccessToken(req);
  const projectId =
    typeof body.projectId === "string" && body.projectId ? body.projectId : null;

  console.log("[chat] POST / prompt length:", body.prompt?.length ?? 0, "threadId:", threadId, "projectId:", projectId ?? "none");
  const response = await chatService.generateCode({
    threadId,
    prompt: body.prompt,
    model: body.model,
    context: { ...body.context, projectId: projectId ?? body.context?.projectId },
  });

  const runCommandRegex = /^\s*RUN_COMMAND:\s*(.+)$/gim;
  const runCommands: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = runCommandRegex.exec(response.message)) !== null) {
    const cmd = match[1].trim();
    if (cmd) runCommands.push(cmd);
  }
  if (runCommands.length && projectId && token) {
    const runResults: Array<{ command: string; exitCode: number; stdout?: string; stderr?: string }> = [];
    for (const command of runCommands) {
      try {
        console.log("[chat] RUN_COMMAND:", command, "projectId:", projectId);
        const result = await builderService.runProjectCommand(token, projectId, command);
        runResults.push({
          command,
          exitCode: result.exitCode,
          stdout: result.stdout?.slice(-500),
          stderr: result.stderr?.slice(-500),
        });
        if (result.exitCode !== 0) {
          console.warn("[chat] RUN_COMMAND non-zero exit:", command, result.exitCode, result.stderr?.slice(-300));
        }
      } catch (err) {
        console.error("[chat] RUN_COMMAND failed:", command, err);
        runResults.push({ command, exitCode: 1 });
      }
    }
    (response as unknown as Record<string, unknown>).runCommandResults = runResults;
    response.message = response.message.replace(runCommandRegex, "").replace(/\n{3,}/g, "\n\n").trim();
    if (!response.message.trim()) {
      const summary = runResults.map((r) => (r.exitCode === 0 ? `Ran: ${r.command}` : `Failed (${r.exitCode}): ${r.command}`)).join("\n");
      response.message = summary;
    }
  }

  const appliedFiles: Array<{ path: string; action: string }> = [];
  if (response.filePlan?.length && projectId && token) {
    for (const item of response.filePlan) {
      try {
        if (item.action === "delete") {
          await builderService.applyBuilderFileAction(token, {
            projectId,
            action: "delete",
            path: item.path,
          });
          appliedFiles.push({ path: item.path, action: "delete" });
          continue;
        }
        let resolvedPath = item.path;
        let currentContent: string | null = null;
        if (item.action === "update") {
          currentContent = await builderService.getBuilderFileContent(token, projectId, item.path);
          if (currentContent == null && item.path.startsWith("src/app/")) {
            const altPath = "app/" + item.path.slice("src/app/".length);
            const altContent = await builderService.getBuilderFileContent(token, projectId, altPath);
            if (altContent != null) {
              resolvedPath = altPath;
              currentContent = altContent;
            }
          }
        }
        const generated = await chatService.generateFileContent({
          path: resolvedPath,
          action: item.action,
          description: item.description,
          currentContent: currentContent ?? undefined,
          model: body.model,
        });
        if (generated.trim()) {
          await builderService.applyBuilderFileAction(token, {
            projectId,
            action: item.action,
            path: resolvedPath,
            content: generated,
          });
          appliedFiles.push({ path: resolvedPath, action: item.action });
        }
      } catch (err) {
        console.error("[chat] File plan item failed:", item.path, item.action, err);
      }
    }
    (response as unknown as Record<string, unknown>).appliedFiles = appliedFiles;
    if (appliedFiles.length > 0 && response.message) {
      const withoutCodeBlocks = response.message.replace(/```[\s\S]*?```/g, "").replace(/\n{3,}/g, "\n\n").trim();
      if (withoutCodeBlocks) (response as unknown as Record<string, string>).message = withoutCodeBlocks;
    }
  }

  const idempotencyKey =
    typeof body.idempotencyKey === "string" && body.idempotencyKey
      ? body.idempotencyKey
      : null;

  const activeTag: ChatTag = body.tag ?? null;
  let totalEarned = 0;
  let latestBalance = 0;

  if (req.user?.id && projectId && idempotencyKey && token) {
    try {
      const promptReward = await rewardService.award(token, projectId, "prompt", idempotencyKey);
      totalEarned += promptReward.amount;
      latestBalance = promptReward.new_balance;

      // Award tag bonus for feature/customer/revenue tags
      const tagEventType = activeTag ? TAG_REWARD_MAP[activeTag] : undefined;
      if (tagEventType) {
        const tagReward = await rewardService.award(
          token,
          projectId,
          tagEventType,
          `${idempotencyKey}-tag-${activeTag}`
        );
        totalEarned += tagReward.amount;
        latestBalance = tagReward.new_balance;
      }

      (response as unknown as Record<string, unknown>).pineapplesEarned = totalEarned;
      (response as unknown as Record<string, unknown>).newBalance = latestBalance;
    } catch {
      // Do not fail the chat response if reward fails
    }

    // Log activity event non-blocking
    const supabase = getSupabaseClientWithAuth(token);
    const promptDescription = body.prompt.length > 120
      ? body.prompt.slice(0, 120) + "…"
      : body.prompt;
    void logActivityEvent(supabase, req.user.id, projectId, "prompt", promptDescription, {
      tag: activeTag ?? undefined,
      pineapplesEarned: totalEarned,
    });
  }

  res.json(response);
}

export async function getChatHistory(req: Request, res: Response): Promise<void> {
  const threadId = req.query.threadId as string;
  if (!threadId) throw badRequest("Thread ID is required");

  const messages = await chatService.getConversationHistory(threadId);
  res.json({ messages });
}
