"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

type LoginDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after successful login or signup (before dialog closes). Use to redirect on dedicated /auth page. */
  onSuccess?: () => void;
};

export function LoginDialog({ open, onOpenChange, onSuccess }: LoginDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();

  useEffect(() => {
    if (open && typeof window !== "undefined") {
      const stored = sessionStorage.getItem("authReturnUrl");
      const returnTo = stored || window.location.pathname + window.location.search;
      sessionStorage.setItem("authReturnTo", returnTo);
    }
  }, [open]);

  const handleOAuth = async (provider: "google" | "github") => {
    if (!supabase) {
      setError("Sign-in with Google/GitHub is not configured.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const returnTo =
        typeof window !== "undefined"
          ? sessionStorage.getItem("authReturnUrl") || window.location.pathname + window.location.search
          : "/";
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`
          : undefined;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (oauthError) throw oauthError;
      // Redirecting away; AuthContext will sync session on return via getSession/onAuthStateChange
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "OAuth sign-in failed");
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      onSuccess?.();
      setEmail("");
      setPassword("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);
    try {
      const result = await signup(email, password, name || undefined);
      if (result?.requiresConfirmation) {
        setSuccessMessage("Account created. Check your email to confirm before signing in.");
        setEmail("");
        setPassword("");
        setName("");
      } else {
        onSuccess?.();
        setEmail("");
        setPassword("");
        setName("");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSuccessMessage("");
      setError("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to VibeCoder</DialogTitle>
          <DialogDescription>
            Sign in to save your projects, or continue in playground mode
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>
          {supabase && (
            <div className="flex gap-2 py-2" role="group" aria-label="Sign in with provider">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={loading}
                onClick={() => handleOAuth("google")}
                aria-label="Sign in with Google"
              >
                Google
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={loading}
                onClick={() => handleOAuth("github")}
                aria-label="Sign in with GitHub"
              >
                GitHub
              </Button>
            </div>
          )}
          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  "Login"
                )}
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="signup">
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Name (optional)</Label>
                <Input
                  id="signup-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={loading}
                />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              {successMessage && (
                <p className="text-sm text-green-600 dark:text-green-400" role="status">
                  {successMessage}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Sign Up"
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

