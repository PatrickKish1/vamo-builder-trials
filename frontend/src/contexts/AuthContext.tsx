"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiV1 } from "@/lib/api";
import { supabase } from "@/lib/supabase";

type User = {
  id: string;
  email: string;
  name: string;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isPlayground: boolean;
  sessionToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<{ requiresConfirmation?: boolean }>;
  logout: () => Promise<void>;
  setPlaygroundMode: (enabled: boolean) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapUserFromSession(data: { id: string; email?: string; user_metadata?: { full_name?: string; name?: string } }): User {
  return {
    id: data.id,
    email: data.email ?? "",
    name: (data.user_metadata?.full_name ?? data.user_metadata?.name ?? data.email ?? "") as string,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlayground, setIsPlayground] = useState(true);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const checkSession = useCallback(async (token: string) => {
    try {
      const response = await fetch(apiV1("/auth/session"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.authenticated && data.user) {
        setUser(data.user);
        setSessionToken(token);
        setIsPlayground(false);
      } else {
        localStorage.removeItem("sessionToken");
        setSessionToken(null);
      }
    } catch (error) {
      console.error("Failed to check session:", error);
      localStorage.removeItem("sessionToken");
      setSessionToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/auth/callback") return;

    const hash = window.location.hash?.slice(1);
    if (hash) {
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      if (accessToken) {
        localStorage.setItem("sessionToken", accessToken);
        const returnTo = sessionStorage.getItem("authReturnTo") || "/";
        sessionStorage.removeItem("authReturnTo");
        window.location.replace(returnTo);
        return;
      }
    }

    const token = localStorage.getItem("sessionToken");
    if (token) {
      checkSession(token);
      return;
    }
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token) {
          localStorage.setItem("sessionToken", session.access_token);
          setSessionToken(session.access_token);
          setUser(mapUserFromSession(session.user));
          setIsPlayground(false);
        }
        setIsLoading(false);
      }).catch(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [checkSession]);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        localStorage.setItem("sessionToken", session.access_token);
        setSessionToken(session.access_token);
        setUser(mapUserFromSession(session.user));
        setIsPlayground(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await fetch(apiV1("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error((error as { error?: string }).error || "Login failed");
    }
    const data = await response.json();
    const token = (data as { session?: { token?: string }; user?: User }).session?.token;
    const userData = (data as { user?: User }).user;
    if (token) {
      localStorage.setItem("sessionToken", token);
      setSessionToken(token);
    }
    if (userData) setUser(userData);
    setIsPlayground(false);
  };

  const signup = async (
    email: string,
    password: string,
    name?: string
  ): Promise<{ requiresConfirmation?: boolean }> => {
    const response = await fetch(apiV1("/auth/signup"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error((error as { error?: string }).error || "Signup failed");
    }
    const data = (await response.json()) as {
      session?: { token?: string };
      user?: User;
      requiresConfirmation?: boolean;
    };
    if (data.requiresConfirmation) {
      return { requiresConfirmation: true };
    }
    const token = data.session?.token;
    const userData = data.user;
    if (token) {
      localStorage.setItem("sessionToken", token);
      setSessionToken(token);
    }
    if (userData) setUser(userData);
    setIsPlayground(false);
    return {};
  };

  const logout = async () => {
    if (sessionToken) {
      try {
        await fetch(apiV1("/auth/logout"), {
          method: "POST",
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
      } catch (error) {
        console.error("Logout error:", error);
      }
      if (supabase) await supabase.auth.signOut();
    }
    localStorage.removeItem("sessionToken");
    setSessionToken(null);
    setUser(null);
    setIsPlayground(true);
  };

  const setPlaygroundMode = useCallback((enabled: boolean) => {
    setIsPlayground(enabled);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isPlayground,
        sessionToken,
        login,
        signup,
        logout,
        setPlaygroundMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
