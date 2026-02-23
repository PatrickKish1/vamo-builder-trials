"use client";

import { useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  getReturnPathAfterLogin,
} from "@/lib/auth-redirect";

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();

  const returnPath = useMemo(() => {
    const fromUrl = searchParams.get("returnTo");
    const stored =
      typeof window !== "undefined" ? sessionStorage.getItem("authReturnUrl") : null;
    return getReturnPathAfterLogin(fromUrl, stored);
  }, [searchParams]);

  const handleSuccess = useCallback(() => {
    if (typeof window !== "undefined") sessionStorage.removeItem("authReturnUrl");
    router.replace(returnPath);
  }, [router, returnPath]);

  useEffect(() => {
    if (!user || isLoading) return;
    if (typeof window !== "undefined") sessionStorage.removeItem("authReturnUrl");
    router.replace(returnPath);
  }, [user, isLoading, router, returnPath]);

  if (user && !isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" aria-live="polite">
        <p className="text-muted-foreground text-sm">Redirecting…</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <section className="w-full max-w-md" aria-label="Sign in">
        <h1 className="sr-only">Sign in to Code Easy</h1>
        <LoginDialog
          open
          onOpenChange={(open) => {
            if (!open) router.replace(returnPath);
          }}
          onSuccess={handleSuccess}
        />
      </section>
    </main>
  );
}
