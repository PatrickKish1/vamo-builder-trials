import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/**
 * Supabase client using anon key only.
 * All data access must go through RLS with the user's JWT when applicable.
 * No service role key in code.
 */
let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return client;
}

/**
 * Create a Supabase client with the user's JWT for RLS.
 * Use this in authenticated routes so RLS policies apply.
 */
export function getSupabaseClientWithAuth(accessToken: string): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

let serviceClient: SupabaseClient | null = null;

/**
 * Service role client (bypasses RLS). Only for invite-by-token and accept-invite.
 * Requires SUPABASE_SERVICE_ROLE_KEY in env.
 */
export function getSupabaseServiceClient(): SupabaseClient {
  const key = env.supabaseServiceRoleKey;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for invite flow");
  if (!serviceClient) {
    serviceClient = createClient(env.supabaseUrl, key);
  }
  return serviceClient;
}
