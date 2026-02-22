"use client";

import { useEffect } from "react";

/**
 * Supabase redirects here after OAuth or email confirmation (hash #access_token=...).
 * We store the token and redirect to returnTo (query or sessionStorage) or /builder.
 */
export default function AuthCallbackPage() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash?.slice(1);
    if (!hash) {
      window.location.replace("/");
      return;
    }

    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    if (!accessToken) {
      window.location.replace("/");
      return;
    }

    localStorage.setItem("sessionToken", accessToken);
    const returnTo =
      new URLSearchParams(window.location.search).get("returnTo") ||
      sessionStorage.getItem("authReturnTo") ||
      "/builder";
    sessionStorage.removeItem("authReturnTo");
    window.location.replace(returnTo.startsWith("/") ? returnTo : "/builder");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Signing you in and redirecting…</p>
    </div>
  );
}
