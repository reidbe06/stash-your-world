import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LogOut, Mail, Bell, Lock, HelpCircle, ChevronRight,
  Sparkles, FolderOpen, Smartphone, Copy, Check,
  ExternalLink, Loader2, ChevronDown, AlertCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AvatarUploader } from "@/components/AvatarUploader";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile & Settings — STASHd" }] }),
  component: Profile,
});

// ─── iCloud shortcut link ─────────────────────────────────────────────────────
// Set to the published iCloud URL once the shortcut is created in the iOS
// Shortcuts app and shared via "Copy iCloud Link".
// Format: https://www.icloud.com/shortcuts/<hash>
const ICLOUD_SHORTCUT_URL: string | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
type Setting = { icon: LucideIcon; label: string; hint: string; onClick?: () => void };

// ─── iOS Shortcut section ─────────────────────────────────────────────────────
function IOSShortcutSection() {
  const { user } = useAuth();
  const [tokenCopied, setTokenCopied] = useState(false);
  const [shortcutOpened, setShortcutOpened] = useState(false);
  const [testState, setTestState] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [testError, setTestError] = useState("");
  const [showToken, setShowToken] = useState(false);

  const { data: tokenData, isLoading: tokenLoading } = useQuery({
    queryKey: ["save-token", user?.id],
    enabled: !!user,
    staleTime: Infinity,
    queryFn: async () => {
      const { data: sess } = await supabase.auth.getSession();
      const bearer = sess.session?.access_token;
      if (!bearer) return null;
      const res = await fetch("/api/me/save-token", {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (!res.ok) return null;
      return res.json() as Promise<{ token: string }>;
    },
  });

  const token = tokenData?.token ?? "";
  const ready = ICLOUD_SHORTCUT_URL !== null;

  // Step 1 — copy token to clipboard
  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 3000);
  }

  // Step 2 — open the signed iCloud shortcut
  function openShortcut() {
    if (!ICLOUD_SHORTCUT_URL) return;
    setShortcutOpened(true);
    const deepLink = `shortcuts://import-shortcut?url=${encodeURIComponent(ICLOUD_SHORTCUT_URL)}`;
    window.location.href = deepLink;
  }

  // Step 3 — test the shortcut works by saving a sample URL
  async function testSave() {
    if (!token) return;
    setTestState("loading");
    setTestError("");
    try {
      const res = await fetch("/api/public/share/save", {
        method: "POST",
        headers: {
          "X-Save-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: "https://www.apple.com/ios/shortcuts/",
          instant: true,
          share_source: "ios_shortcut",
        }),
      });
      if (res.ok) {
        setTestState("ok");
      } else {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setTestError(body?.error ?? "Save failed");
        setTestState("err");
      }
    } catch (e: any) {
      setTestError(e?.message ?? "Network error");
      setTestState("err");
    }
  }

  const tokenReady = !tokenLoading && !!token;

  return (
    <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-primary-foreground shadow-brand">
          <Smartphone className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">iOS Shortcut</p>
          <p className="text-xs text-muted-foreground">Save from any app — one tap, no sign-in</p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-1">

        {/* ── Not published yet ─────────────────────────────────────────────── */}
        {!ready && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <p>The signed shortcut is being finalized. Check back soon — setup will be one tap once it's live.</p>
          </div>
        )}

        {/* ── Steps ────────────────────────────────────────────────────────── */}
        {ready && (
          <div className="divide-y">

            {/* Step 1 */}
            <div className="flex items-start gap-4 py-4">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold mt-0.5 ${tokenCopied ? "bg-green-500 text-white" : "bg-primary text-primary-foreground"}`}>
                {tokenCopied ? <Check className="h-3.5 w-3.5" /> : "1"}
              </span>
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold leading-tight">Copy My Token</p>
                <p className="text-xs text-muted-foreground">Your personal save token goes to your clipboard. You'll paste it once during setup.</p>
                <button
                  onClick={copyToken}
                  disabled={!tokenReady}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-1.5 text-xs font-semibold shadow-sm transition hover:bg-accent disabled:opacity-50"
                >
                  {tokenCopied
                    ? <><Check className="h-3 w-3 text-green-500" /> Copied!</>
                    : tokenLoading
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Loading…</>
                    : <><Copy className="h-3 w-3" /> Copy My Token</>}
                </button>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-4 py-4">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold mt-0.5 ${shortcutOpened ? "bg-green-500 text-white" : "bg-primary text-primary-foreground"}`}>
                {shortcutOpened ? <Check className="h-3.5 w-3.5" /> : "2"}
              </span>
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold leading-tight">Install Shortcut</p>
                <p className="text-xs text-muted-foreground">
                  iOS opens the Shortcuts app. Tap <strong>Add Shortcut</strong>. When it asks <em>"Paste your STASHd token"</em>, paste from clipboard.
                </p>
                <button
                  onClick={openShortcut}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-brand transition active:scale-95"
                >
                  <ExternalLink className="h-3 w-3" /> Get Shortcut
                </button>

                {shortcutOpened && (
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Didn't open?{" "}
                    <a
                      href={`shortcuts://import-shortcut?url=${encodeURIComponent(ICLOUD_SHORTCUT_URL!)}`}
                      className="underline underline-offset-2 text-primary"
                    >
                      Tap here
                    </a>
                  </p>
                )}
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-4 py-4">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold mt-0.5 ${testState === "ok" ? "bg-green-500 text-white" : "bg-primary text-primary-foreground"}`}>
                {testState === "ok" ? <Check className="h-3.5 w-3.5" /> : "3"}
              </span>
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold leading-tight">Test Save</p>
                <p className="text-xs text-muted-foreground">Confirm your shortcut is connected correctly before using it for real.</p>

                {testState === "ok" ? (
                  <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400 font-semibold">
                    <Check className="h-3.5 w-3.5" />
                    Saved! Your shortcut is working.{" "}
                    <Link to="/dashboard" className="underline underline-offset-2">
                      See it →
                    </Link>
                  </div>
                ) : testState === "err" ? (
                  <div className="space-y-2">
                    <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {testError || "Save failed — token may not be set correctly."}
                    </p>
                    <button
                      onClick={() => setTestState("idle")}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-1.5 text-xs font-semibold shadow-sm transition hover:bg-accent"
                    >
                      Try Again
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={testSave}
                    disabled={!tokenReady || testState === "loading"}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-1.5 text-xs font-semibold shadow-sm transition hover:bg-accent disabled:opacity-50"
                  >
                    {testState === "loading"
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Testing…</>
                      : "Run Test Save"}
                  </button>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ── Need help? ────────────────────────────────────────────────────── */}
        <div className="pt-2 pb-1">
          <button
            onClick={() => setShowToken(t => !t)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showToken ? "rotate-180" : ""}`} />
            Need help? View your token
          </button>

          {showToken && (
            <div className="mt-3 rounded-xl border bg-accent/30 p-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Save Token</p>
              {tokenLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <code className="block break-all rounded-lg bg-background px-3 py-2 text-[11px] font-mono text-foreground border select-all">
                    {token}
                  </code>
                  <p className="text-[11px] text-muted-foreground">
                    Enter this exactly when Shortcuts asks "Paste your STASHd token" during import.
                  </p>
                  <button
                    onClick={copyToken}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm transition hover:text-foreground"
                  >
                    {tokenCopied ? <><Check className="h-3 w-3 text-green-500" /> Copied!</> : <><Copy className="h-3 w-3" /> Copy</>}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Profile page ─────────────────────────────────────────────────────────────
function Profile() {
  const { user } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [items, cols] = await Promise.all([
        supabase.from("items").select("id", { count: "exact", head: true }),
        supabase.from("collections").select("id", { count: "exact", head: true }),
      ]);
      return { items: items.count ?? 0, collections: cols.count ?? 0 };
    },
  });

  const settings: Setting[] = [
    { icon: Bell, label: "Notifications", hint: "Manage alerts and updates" },
    { icon: Lock, label: "Privacy", hint: "Control who sees your stash" },
    { icon: Sparkles, label: "Appearance", hint: "Theme and display options" },
    { icon: HelpCircle, label: "Help & support", hint: "Get answers and contact us" },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Avatar */}
      <div className="rounded-3xl border bg-card p-8 text-center shadow-card">
        <AvatarUploader />
        <h1 className="mt-4 text-xl font-bold">{user?.email}</h1>
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Mail className="h-3 w-3" /> Verified member
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Link to="/dashboard" className="rounded-2xl border bg-card p-5 text-center shadow-card transition hover:shadow-brand">
          <p className="text-3xl font-extrabold text-brand-gradient">{stats?.items ?? 0}</p>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Saves</p>
        </Link>
        <Link to="/collections" className="rounded-2xl border bg-card p-5 text-center shadow-card transition hover:shadow-brand">
          <p className="text-3xl font-extrabold text-brand-gradient">{stats?.collections ?? 0}</p>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Collections</p>
        </Link>
      </div>

      {/* Collections link */}
      <Link
        to="/collections"
        className="flex items-center gap-4 rounded-2xl border bg-card px-5 py-4 shadow-card transition hover:shadow-brand"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-primary-foreground shadow-brand">
          <FolderOpen className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <span className="block text-sm font-semibold">My Collections</span>
          <span className="block text-xs text-muted-foreground">
            {stats?.collections === 1 ? "1 collection" : `${stats?.collections ?? 0} collections`}
          </span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>

      {/* iOS Shortcut */}
      <IOSShortcutSection />

      {/* Settings */}
      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Settings</h2>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
          {settings.map((s, i) => (
            <button
              key={s.label}
              onClick={s.onClick}
              className={`flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-accent/40 ${i < settings.length - 1 ? "border-b" : ""}`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
                <s.icon className="h-5 w-5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>

      {/* Sign out */}
      <button
        onClick={() => supabase.auth.signOut()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border bg-card py-3 text-sm font-semibold shadow-card hover:bg-accent"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
