import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LogOut, Mail, Bell, Lock, HelpCircle, ChevronRight,
  Sparkles, FolderOpen, Smartphone, Copy, Check,
  ExternalLink, AlertCircle, Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AvatarUploader } from "@/components/AvatarUploader";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile & Settings — STASHd" }] }),
  component: Profile,
});

// ─────────────────────────────────────────────────────────────────────────────
// Replace this with the real iCloud shortcut link once it's created in the
// iOS Shortcuts app and shared via "Copy iCloud Link".
// Format: https://www.icloud.com/shortcuts/<hash>
// ─────────────────────────────────────────────────────────────────────────────
const ICLOUD_SHORTCUT_URL: string | null = null; // TODO: set after creating shortcut

type Setting = { icon: LucideIcon; label: string; hint: string; onClick?: () => void };

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm transition hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function useIsIOS() {
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
  }, []);
  return isIOS;
}

function IOSShortcutSection() {
  const { user } = useAuth();
  const isIOS = useIsIOS();
  const [status, setStatus] = useState<"idle" | "opening" | "error">("idle");
  const [tokenCopied, setTokenCopied] = useState(false);

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

  async function copyTokenThenOpenShortcut() {
    if (!ICLOUD_SHORTCUT_URL) return;
    // Copy token to clipboard first so user can paste it in Shortcuts
    try {
      await navigator.clipboard.writeText(token);
      setTokenCopied(true);
    } catch {
      // clipboard may not be available; proceed anyway
    }
    setStatus("opening");
    const deepLink = `shortcuts://import-shortcut?url=${encodeURIComponent(ICLOUD_SHORTCUT_URL)}`;
    window.location.href = deepLink;
    setTimeout(() => setStatus("opening"), 4000);
  }

  const shortcutReady = ICLOUD_SHORTCUT_URL !== null;
  const canGetShortcut = shortcutReady && !tokenLoading && !!token;

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

      <div className="space-y-4 px-5 py-4">

        {/* ── Coming soon banner if shortcut not published yet ─────────────── */}
        {!shortcutReady && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/60 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <p>The shareable shortcut is being finalized. Check back soon — this will be one tap once it's live.</p>
          </div>
        )}

        {/* ── How it works ─────────────────────────────────────────────────── */}
        {shortcutReady && (
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
              <span>Copy your <strong className="text-foreground">Save Token</strong> below — it goes to your clipboard automatically when you tap Get Shortcut.</span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
              <span>Tap <strong className="text-foreground">Get Shortcut</strong>. iOS opens Shortcuts — tap <strong className="text-foreground">Add Shortcut</strong>.</span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">3</span>
              <span>When Shortcuts asks for your token, <strong className="text-foreground">paste from clipboard</strong>.</span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">4</span>
              <span>Share any link → tap <strong className="text-foreground">Save to STASHd</strong> in the share sheet.</span>
            </li>
          </ol>
        )}

        {/* ── Save token ───────────────────────────────────────────────────── */}
        <div className="rounded-xl border bg-accent/30 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Save Token</p>
          {tokenLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <code className="block break-all rounded-lg bg-background px-3 py-2.5 text-[11px] font-mono text-foreground border select-all">
                {token}
              </code>
              <div className="flex items-center gap-2 flex-wrap">
                {token && <CopyButton text={token} label="Copy Token" />}
                <p className="text-[11px] text-muted-foreground">Never expires · treat like a password</p>
              </div>
            </>
          )}
        </div>

        {/* ── Get Shortcut button ──────────────────────────────────────────── */}
        {shortcutReady && (
          <>
            <button
              onClick={copyTokenThenOpenShortcut}
              disabled={!canGetShortcut}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-gradient py-3 text-sm font-semibold text-primary-foreground shadow-brand disabled:opacity-60"
            >
              {status === "opening" ? (
                <><ExternalLink className="h-4 w-4" /> Opening Shortcuts…</>
              ) : (
                <><Smartphone className="h-4 w-4" /> Get Shortcut</>
              )}
            </button>

            {/* Fallback manual link */}
            {status === "opening" && (
              <div className="rounded-xl border border-dashed border-amber-400/60 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 space-y-2">
                <p className="font-semibold">Shortcuts didn't open?</p>
                <a
                  href={`shortcuts://import-shortcut?url=${encodeURIComponent(ICLOUD_SHORTCUT_URL!)}`}
                  className="flex items-center gap-1.5 font-semibold underline underline-offset-2"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" /> Open in Shortcuts
                </a>
                {tokenCopied && (
                  <p className="text-green-700 dark:text-green-400 font-medium">✓ Token copied to clipboard — paste it when Shortcuts asks.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

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
      {/* Avatar card */}
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
