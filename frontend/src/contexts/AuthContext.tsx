"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { COOKIE_SESSION } from "@/lib/api";
import {
  loginAction,
  signupAction,
  logoutAction,
  type AuthUser,
} from "@/app/actions/auth";

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  isPlayground: boolean;
  sessionToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<{ requiresConfirmation?: boolean }>;
  logout: () => Promise<void>;
  setPlaygroundMode: (enabled: boolean) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({
  children,
  initialSession,
}: {
  children: React.ReactNode;
  initialSession?: AuthUser | null;
}) {
  const [user, setUser] = useState<AuthUser | null>(initialSession ?? null);
  const [isLoading, setIsLoading] = useState(initialSession === undefined);
  const [isPlayground, setIsPlayground] = useState(!initialSession);
  const [sessionToken, setSessionToken] = useState<string | null>(
    initialSession ? COOKIE_SESSION : null
  );

  useEffect(() => {
    if (initialSession !== undefined) {
      setUser(initialSession);
      setSessionToken(initialSession ? COOKIE_SESSION : null);
      setIsPlayground(!initialSession);
      setIsLoading(false);
    }
  }, [initialSession]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginAction(email, password);
    if ("error" in result) throw new Error(result.error);
    setUser(result.user);
    setSessionToken(COOKIE_SESSION);
    setIsPlayground(false);
  }, []);

  const signup = useCallback(
    async (
      email: string,
      password: string,
      name?: string
    ): Promise<{ requiresConfirmation?: boolean }> => {
      const result = await signupAction(email, password, name);
      if ("error" in result) throw new Error(result.error);
      if ("requiresConfirmation" in result) return { requiresConfirmation: true };
      setUser(result.user);
      setSessionToken(COOKIE_SESSION);
      setIsPlayground(false);
      return {};
    },
    []
  );

  const logout = useCallback(async () => {
    await logoutAction();
    setSessionToken(null);
    setUser(null);
    setIsPlayground(true);
  }, []);

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
