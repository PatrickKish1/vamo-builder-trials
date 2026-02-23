import crypto from "crypto";
import type { Request, Response } from "express";
import { broadcast } from "../services/realtime.service.js";
import { env } from "../config/env.js";
import { clearCacheBySandboxId } from "../services/builder-sandbox.service.js";
import * as builderService from "../services/builder.service.js";

export async function elevenlabsWebhook(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ received: true });
}

export async function elevenlabsCodeGeneration(req: Request, res: Response): Promise<void> {
  const body = req.body as { projectId?: string; path?: string; content?: string; action?: string };
  if (body.projectId && (body.path || body.action)) {
    broadcast("file:created", {
      projectId: body.projectId,
      path: body.path,
      content: body.content,
    });
  }
  res.status(200).json({ received: true });
}

/** E2B lifecycle event payload (see e2b.mintlify.app/docs/sandbox/lifecycle-events-webhooks). */
interface E2BWebhookPayload {
  version: string;
  id: string;
  type: string;
  eventData: Record<string, unknown> | null;
  sandboxBuildId: string;
  sandboxExecutionId: string;
  sandboxId: string;
  sandboxTeamId: string;
  sandboxTemplateId: string;
  timestamp: string;
}

/**
 * Verify E2B webhook signature: SHA256(secret + rawPayload) base64, trailing '=' stripped.
 * @see https://e2b.mintlify.app/docs/sandbox/lifecycle-events-webhooks#webhook-verification
 */
function verifyE2BWebhookSignature(secret: string, rawPayload: string, signature: string): boolean {
  const expected = crypto.createHash("sha256").update(secret + rawPayload).digest("base64").replace(/=+$/, "");
  return expected === signature;
}

/**
 * E2B sandbox lifecycle webhook. Expects raw JSON body (use express.raw() for this route).
 * Verifies e2b-signature when E2B_WEBHOOK_SIGNATURE_SECRET is set.
 * On sandbox.lifecycle.killed: clears in-memory cache and DB sandbox_id so next use creates a new sandbox.
 */
export async function e2bLifecycleWebhook(req: Request, res: Response): Promise<void> {
  const rawBody =
    req.body instanceof Buffer
      ? req.body.toString("utf8")
      : typeof req.body === "string"
        ? req.body
        : "";
  const signature = (req.headers["e2b-signature"] as string) ?? "";
  const secret = env.e2bWebhookSignatureSecret;

  if (secret) {
    if (!signature) {
      res.status(401).json({ error: "Missing e2b-signature header" });
      return;
    }
    if (!verifyE2BWebhookSignature(secret, rawBody, signature)) {
      console.warn("[webhooks] E2B signature verification failed");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  }

  let payload: E2BWebhookPayload;
  try {
    payload = JSON.parse(rawBody || "{}") as E2BWebhookPayload;
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const { type, sandboxId } = payload;
  const deliveryId = req.headers["e2b-delivery-id"];

  if (type === "sandbox.lifecycle.killed") {
    clearCacheBySandboxId(sandboxId);
    await builderService.clearSandboxIdBySandboxId(sandboxId);
    console.log("[webhooks] E2B sandbox killed, cleared cache and DB", { sandboxId, deliveryId });
  } else if (
    type === "sandbox.lifecycle.created" ||
    type === "sandbox.lifecycle.updated" ||
    type === "sandbox.lifecycle.paused" ||
    type === "sandbox.lifecycle.resumed"
  ) {
    console.log("[webhooks] E2B lifecycle", type, { sandboxId, deliveryId });
  }

  res.status(200).json({ received: true });
}
