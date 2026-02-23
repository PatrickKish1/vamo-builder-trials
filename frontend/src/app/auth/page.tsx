"use client";

import { useEffect, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { Particles } from "@/components/Particles";
import { useAuth } from "@/contexts/AuthContext";
import { getReturnPathAfterLogin } from "@/lib/auth-redirect";

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const returnPath = useMemo(() => {
    const fromUrl = searchParams.get("returnTo");
    const stored =
      typeof window !== "undefined"
        ? sessionStorage.getItem("authReturnUrl")
        : null;
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

  const particleColors = mounted
    ? resolvedTheme === "light"
      ? ["#000000"]
      : ["#ffffff"]
    : ["#ffffff"];

  if (user && !isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background"
        aria-live="polite"
      >
        <p className="text-muted-foreground text-sm">Redirecting…</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4 relative overflow-hidden">
      <div
        className="fixed inset-0 w-full h-full -z-10"
        aria-hidden
      >
        <Particles
          particleColors={particleColors}
          particleCount={200}
          particleSpread={10}
          speed={0.1}
          particleBaseSize={100}
          moveParticlesOnHover
          alphaParticles={false}
          disableRotation={false}
          pixelRatio={1}
        />
      </div>
      <section
        className="w-full max-w-md relative z-0"
        aria-label="Sign in"
      >
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
