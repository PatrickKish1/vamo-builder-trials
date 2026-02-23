/** Central env validation. See .env.example for keys. */
function getEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

function getEnvOptional(key: string): string | undefined {
  const value = process.env[key];
  return value === "" ? undefined : value;
}

export const env = {
  get supabaseUrl(): string {
    return getEnv("SUPABASE_URL");
  },
  get supabaseAnonKey(): string {
    return getEnv("SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey(): string | undefined {
    return getEnvOptional("SUPABASE_SERVICE_ROLE_KEY");
  },
  get port(): number {
    const raw = getEnvOptional("PORT") ?? "4000";
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 65535) {
      throw new Error(`Invalid PORT: ${raw}`);
    }
    return n;
  },
  get nodeEnv(): string {
    return getEnvOptional("NODE_ENV") ?? "development";
  },
  get isProduction(): boolean {
    return env.nodeEnv === "production";
  },
  get frontendOrigin(): string | undefined {
    return getEnvOptional("FRONTEND_ORIGIN");
  },
  get groqApiKey(): string | undefined {
    return getEnvOptional("GROQ_API_KEY");
  },
  get openaiApiKey(): string | undefined {
    return getEnvOptional("OPENAI_API_KEY");
  },
  get anthropicApiKey(): string | undefined {
    return getEnvOptional("ANTHROPIC_API_KEY");
  },
  get googleGenAiApiKey(): string | undefined {
    return getEnvOptional("GOOGLE_GENERATIVE_AI_API_KEY");
  },
  get xaiApiKey(): string | undefined {
    return getEnvOptional("XAI_API_KEY");
  },
  get elevenlabsApiKey(): string | undefined {
    return getEnvOptional("ELEVENLABS_API_KEY");
  },
  get e2bApiKey(): string | undefined {
    return getEnvOptional("E2B_API_KEY");
  },
  /** Custom E2B template name for builder sandboxes (e.g. code-easy-nextjs). When set, new sandboxes use this template so create-next-app and pnpm install are pre-baked. Build once with: pnpm exec tsx scripts/build-e2b-template.ts */
  get e2bBuilderTemplateName(): string | undefined {
    const v = getEnvOptional("E2B_BUILDER_TEMPLATE_NAME");
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  },
  /** Secret used to verify E2B webhook signatures (same value as when registering the webhook). Optional. */
  get e2bWebhookSignatureSecret(): string | undefined {
    return getEnvOptional("E2B_WEBHOOK_SIGNATURE_SECRET");
  },
  /** Supabase Storage bucket name for project logos (private bucket; use signed URLs). 5MB max, image/jpeg, image/jpg, image/png. Set SUPABASE_STORAGE_BUCKET or SUPABASE_LOGO_BUCKET. */
  get supabaseLogoBucket(): string | undefined {
    const a = getEnvOptional("SUPABASE_STORAGE_BUCKET");
    const b = getEnvOptional("SUPABASE_LOGO_BUCKET");
    const raw = a ?? b;
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return trimmed.length > 0 ? trimmed : undefined;
  },
} as const;
