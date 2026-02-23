"use client";

import { useEffect } from "react";
import { setSessionFromTokenAction } from "@/app/actions/auth";

/**
 * OAuth redirect lands here (hash #access_token=...). We send the token to the backend
 * to validate and set the session cookie, then redirect.
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

    const returnTo =
      new URLSearchParams(window.location.search).get("returnTo") ||
      sessionStorage.getItem("authReturnTo") ||
      "/builder";
    sessionStorage.removeItem("authReturnTo");

    setSessionFromTokenAction(accessToken)
      .then((result) => {
        if ("user" in result) {
          window.location.replace(returnTo.startsWith("/") ? returnTo : "/builder");
        } else {
          window.location.replace("/auth");
        }
      })
      .catch(() => {
        window.location.replace("/auth");
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Signing you in and redirecting…</p>
    </div>
  );
}
