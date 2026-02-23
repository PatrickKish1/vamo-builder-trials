"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Mail } from "lucide-react";
import { toast } from "sonner";
import { apiV1, authFetch } from "@/lib/api";
import { LoginDialog } from "@/components/auth/LoginDialog";

interface InviteInfo {
  projectId: string;
  projectName: string;
}

export default function BuilderJoinPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const { user, sessionToken } = useAuth();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const fetchInvite = useCallback(async () => {
    if (!token.trim()) {
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(apiV1(`/builder/invite?token=${encodeURIComponent(token)}`));
      if (response.ok) {
        const data = (await response.json()) as InviteInfo;
        setInvite(data);
      } else {
        setInvite(null);
      }
    } catch {
      setInvite(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchInvite();
  }, [fetchInvite]);

  useEffect(() => {
    if (typeof window === "undefined" || !token.trim()) return;
    sessionStorage.setItem("authReturnUrl", `/builder/join?token=${encodeURIComponent(token)}`);
  }, [token]);

  const handleAccept = async () => {
    if (!sessionToken || !token.trim() || !invite || accepting) return;
    setAccepting(true);
    try {
      const response = await authFetch(apiV1("/builder/invite/accept"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }, sessionToken);
      const data = (await response.json()) as { projectId?: string; error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Failed to accept invite");
        return;
      }
      const projectId = data.projectId ?? invite.projectId;
      toast.success("You have joined the project");
      router.replace(`/builder/build/${projectId}`);
    } catch {
      toast.error("Failed to accept invite");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">Loading invite…</p>
      </div>
    );
  }

  if (!token.trim() || !invite) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-muted-foreground text-center">Invite not found or expired.</p>
        <Button variant="outline" onClick={() => router.push("/builder")}>
          Go to Builder
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-4">
      <div className="max-w-md w-full rounded-lg border bg-card p-6 shadow-sm text-center space-y-4">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/10 p-4" aria-hidden>
            <Users className="h-10 w-10 text-primary" />
          </div>
        </div>
        <div>
          <h1 className="text-xl font-semibold">You&apos;re invited</h1>
          <p className="text-muted-foreground mt-1">
            You have been invited to collaborate on <strong>{invite.projectName}</strong>.
          </p>
        </div>
        {user && sessionToken ? (
          <Button
            className="w-full gap-2"
            onClick={() => void handleAccept()}
            disabled={accepting}
          >
            {accepting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Mail className="h-4 w-4" aria-hidden />
            )}
            Accept invite
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Sign in or sign up to accept this invite.</p>
            <Button className="w-full gap-2" onClick={() => setLoginOpen(true)}>
              <Mail className="h-4 w-4" aria-hidden />
              Sign in to accept
            </Button>
          </div>
        )}
      </div>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}
