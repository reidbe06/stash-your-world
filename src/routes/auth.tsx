import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — STASHd" }, { name: "description", content: "Sign in or create your STASHd account." }] }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "At least 6 characters").max(100),
});

function AuthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && mode !== "reset") {
      const pending = sessionStorage.getItem("stashd_pending_share");
      if (pending) {
        sessionStorage.removeItem("stashd_pending_share");
        navigate({ to: "/share", search: { url: pending } });
      } else {
        navigate({ to: "/dashboard" });
      }
    }
  }, [user, navigate, mode]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("reset");
    });
    return () => subscription.unsubscribe();
  }, []);

  function humanizeAuthError(message: string): string {
    const m = message.toLowerCase();
    if (m.includes("invalid login credentials") || m.includes("invalid email or password"))
      return "Email or password is incorrect. Please try again.";
    if (m.includes("email not confirmed"))
      return "Please check your inbox and verify your email before signing in.";
    if (m.includes("user already registered") || m.includes("already been registered"))
      return "That email is already registered. Try signing in instead.";
    if (m.includes("rate limit") || m.includes("too many requests") || m.includes("email rate limit"))
      return "Too many attempts. Please wait a few minutes and try again.";
    if (m.includes("password should be at least") || m.includes("password must be"))
      return "Password must be at least 6 characters.";
    if (m.includes("unable to validate") || m.includes("network") || m.includes("fetch"))
      return "Connection error. Check your internet and try again.";
    if (m.includes("signup is disabled"))
      return "New sign-ups are currently paused. Contact us if you have a beta invite.";
    return message;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const trimmed = email.trim();
        if (!trimmed) { toast.error("Enter your email address."); setBusy(false); return; }
        const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success("Check your inbox — we sent a reset link.");
        setMode("signin");
        setBusy(false);
        return;
      }
      if (mode === "reset") {
        if (password.length < 6) { toast.error("Password must be at least 6 characters."); setBusy(false); return; }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success("Password updated! You're signed in.");
        setMode("signin");
        setBusy(false);
        return;
      }
      const parsed = schema.safeParse({ email, password });
      if (!parsed.success) { toast.error(parsed.error.issues[0].message); setBusy(false); return; }
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Account created! Welcome to STASHd.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(humanizeAuthError(err.message ?? "Authentication failed"));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-soft-gradient">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/"><Logo /></Link>
      </header>
      <main className="mx-auto max-w-md px-6 pt-8 pb-16">
        <div className="rounded-3xl border bg-card p-8 shadow-card">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Private Beta
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your stash" : mode === "forgot" ? "Reset password" : "Set new password"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to access your saves." : mode === "signup" ? "Start saving everything you love." : mode === "forgot" ? "We'll email you a reset link." : "Choose a new password for your account."}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode !== "reset" && (
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1.5" />
              </div>
            )}
            {(mode === "signin" || mode === "signup" || mode === "reset") && (
              <div>
                <Label htmlFor="password">{mode === "reset" ? "New password" : "Password"}</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="mt-1.5" />
              </div>
            )}
            <button type="submit" disabled={busy} className="w-full rounded-full bg-brand-gradient py-3 text-sm font-semibold text-primary-foreground shadow-brand disabled:opacity-60">
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Update password"}
            </button>
          </form>
          {mode === "signin" && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <button onClick={() => setMode("signup")} className="text-sm text-muted-foreground hover:text-foreground">
                No account? Sign up
              </button>
              <button onClick={() => setMode("forgot")} className="text-sm text-muted-foreground hover:text-foreground">
                Forgot password?
              </button>
            </div>
          )}
          {mode === "signup" && (
            <button onClick={() => setMode("signin")} className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground">
              Have an account? Sign in
            </button>
          )}
          {(mode === "forgot") && (
            <button onClick={() => setMode("signin")} className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground">
              ← Back to sign in
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
