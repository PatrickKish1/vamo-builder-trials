import type { SupabaseClient } from "@supabase/supabase-js";

const AVATAR_BASE_URL = "https://api.dicebear.com/7.x/avataaars/png";

/**
 * Returns a deterministic avatar image URL for a user (same URL for same userId).
 * No external call; use this as the stored avatar_url when we have no custom avatar.
 */
export function getGeneratedAvatarUrl(userId: string): string {
  const seed = encodeURIComponent(userId);
  return `${AVATAR_BASE_URL}?seed=${seed}&size=128`;
}

/**
 * If the profile has no avatar_url, set it to a generated avatar URL and return that URL.
 * Uses the given Supabase client (with user auth) so RLS allows updating the profile.
 */
export async function ensureUserAvatar(
  userId: string,
  supabase: SupabaseClient
): Promise<string> {
  const avatarUrl = getGeneratedAvatarUrl(userId);
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .is("avatar_url", null);

  if (error) {
    console.error("[profile] Failed to set generated avatar:", error.message);
    return avatarUrl;
  }
  return avatarUrl;
}
