import { Router, type Request, type Response } from "express";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, "..", "..", "logs");
const CRASH_LOG_FILE = path.join(LOGS_DIR, "crashes.ndjson");

/** In-memory IP rate limiting — max 10 crash reports per IP per minute. */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

/** Clean up stale rate-limit entries every 5 minutes. */
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 5 * 60_000).unref();

interface CrashPayload {
  message?: unknown;
  stack?: unknown;
  digest?: unknown;
  route?: unknown;
  userAgent?: unknown;
  timestamp?: unknown;
  extra?: unknown;
}

function sanitiseString(val: unknown, maxLen = 4096): string {
  if (typeof val !== "string") return "";
  return val.slice(0, maxLen).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

export const logsRouter: Router = Router();

logsRouter.post("/crash", async (req: Request, res: Response): Promise<void> => {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";

  if (isRateLimited(ip)) {
    res.status(429).json({ ok: false, error: "Too many requests" });
    return;
  }

  const body = (req.body ?? {}) as CrashPayload;

  const entry = {
    ts: new Date().toISOString(),
    ip,
    route: sanitiseString(body.route),
    message: sanitiseString(body.message),
    stack: sanitiseString(body.stack, 8192),
    digest: sanitiseString(body.digest),
    userAgent: sanitiseString(body.userAgent),
    extra: typeof body.extra === "object" && body.extra !== null ? body.extra : undefined,
  };

  console.error("[crash-report]", entry.ts, entry.route, entry.message);

  try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
    await fs.appendFile(CRASH_LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
  } catch (writeErr) {
    console.error("[crash-report] Failed to write to log file:", writeErr);
  }

  res.status(202).json({ ok: true });
});
