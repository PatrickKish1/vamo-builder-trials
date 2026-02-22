"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { useAuth } from "@/contexts/AuthContext";

const AFTER_LOGIN_PATH = "/builder";

export default function AuthPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const handleSuccess = useCallback(() => {
    router.replace(AFTER_LOGIN_PATH);
  }, [router]);

  useEffect(() => {
    if (!user || isLoading) return;
    router.replace(AFTER_LOGIN_PATH);
  }, [user, isLoading, router]);

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
            if (!open) router.replace(AFTER_LOGIN_PATH);
          }}
          onSuccess={handleSuccess}
        />
      </section>
    </main>
  );
}
