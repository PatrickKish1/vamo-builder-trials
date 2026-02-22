import { getSupabaseClient } from "../config/supabase.js";
import type { User, LoginSignupResponse, SessionResponse } from "../types/api.types.js";
import { badRequest, unauthorized } from "../utils/errors.js";

function toUser(
  id: string,
  email: string | undefined,
  rawUserMetaData: Record<string, unknown> | undefined
): User {
  const name =
    (rawUserMetaData?.full_name as string) ??
    (rawUserMetaData?.name as string) ??
    (email ?? "").split("@")[0] ??
    "";
  return { id, email: email ?? "", name };
}

export async function login(
  email: string,
  password: string
): Promise<LoginSignupResponse> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw badRequest(error.message);
  }

  if (!data.session || !data.user) {
    throw unauthorized("Login failed");
  }

  const user = toUser(
    data.user.id,
    data.user.email,
    data.user.user_metadata as Record<string, unknown> | undefined
  );

  return {
    session: {
      userId: data.session.user.id,
      token: data.session.access_token,
    },
    user,
  };
}

export async function signup(
  email: string,
  password: string,
  name?: string
): Promise<LoginSignupResponse> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: name ? { full_name: name, name } : undefined,
    },
  });

  if (error) {
    throw badRequest(error.message);
  }

  if (!data.user) {
    throw badRequest("Signup failed");
  }

  const user = toUser(
    data.user.id,
    data.user.email,
    data.user.user_metadata as Record<string, unknown> | undefined
  );

  if (!data.session) {
    return {
      user,
      requiresConfirmation: true,
    };
  }

  return {
    session: {
      userId: data.session.user.id,
      token: data.session.access_token,
    },
    user,
  };
}

export async function getSessionUser(accessToken: string): Promise<SessionResponse> {
  const supabase = getSupabaseClient();
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !authUser) {
    return { user: null, authenticated: false };
  }

  const user = toUser(
    authUser.id,
    authUser.email,
    authUser.user_metadata as Record<string, unknown> | undefined
  );
  return { user, authenticated: true };
}

export function logout(): { success: true } {
  return { success: true };
}
