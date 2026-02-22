/**
 * Silent crash reporter — sends error info to the backend log ingest endpoint.
 * Never throws. Never blocks the UI. Fire-and-forget.
 */

interface CrashReport {
  message: string;
  stack?: string;
  /** Next.js error digest (from error.tsx boundary) */
  digest?: string;
  /** Current pathname at time of crash */
  route?: string;
  extra?: Record<string, unknown>;
}

const INGEST_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/v1/logs/crash`;

/** Deduplicate within a session so the same error is not sent more than once. */
const reportedDigests = new Set<string>();

export function reportCrash(error: unknown, opts: Partial<CrashReport> = {}): void {
  try {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown error";

    const stack = error instanceof Error ? (error.stack ?? "") : "";
    const digest = opts.digest ?? "";

    const dedupeKey = digest || `${message}:${stack.slice(0, 120)}`;
    if (reportedDigests.has(dedupeKey)) return;
    reportedDigests.add(dedupeKey);

    const payload: CrashReport = {
      message,
      stack,
      digest,
      route: opts.route ?? (typeof window !== "undefined" ? window.location.pathname : ""),
      extra: opts.extra,
    };

    const body = JSON.stringify({
      ...payload,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      timestamp: new Date().toISOString(),
    });

    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(INGEST_URL, blob);
    } else {
      fetch(INGEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Never let the reporter itself crash anything.
  }
}
