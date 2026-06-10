import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LogOut, Mail, Bell, Lock, HelpCircle, ChevronRight,
  Sparkles, FolderOpen, Smartphone, Copy, Check,
  Download, Loader2,
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

type Setting = { icon: LucideIcon; label: string; hint: string; onClick?: () => void };

function CopyButton({ text }: { text: string }) {
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
      {copied ? "Copied!" : "Copy token"}
    </button>
  );
}

function IOSShortcutSection() {
  const { user } = useAuth();
  const [revealed, setRevealed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

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

  async function downloadPersonalised() {
    setDownloading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const bearer = sess.session?.access_token;
      if (!bearer) throw new Error("Not signed in");

      const res = await fetch("/api/me/shortcut", {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (!res.ok) throw new Error(await res.text());

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "STASHd.shortcut";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 4000);
    } catch (err) {
      console.error("Download failed", err);
    } finally {
      setDownloading(false);
    }
  }

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
        {/* Steps */}
        <ol className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
            <span>Tap <strong className="text-foreground">Download My Shortcut</strong> below.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
            <span>iOS opens Shortcuts — tap <strong className="text-foreground">Add Shortcut</strong>.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">3</span>
            <span>Share any link from Instagram, TikTok, Pinterest, or Safari → tap <strong className="text-foreground">Save to STASHd</strong>.</span>
          </li>
        </ol>

        <div className="rounded-xl border border-dashed border-green-400/60 bg-green-50 px-4 py-2.5 text-xs text-green-800 dark:bg-green-950/30 dark:text-green-300">
          <span className="font-semibold">✓ No token copy-paste needed.</span> Your personal token is pre-embedded in the download.
        </div>

        {/* Personalised download */}
        <button
          onClick={downloadPersonalised}
          disabled={downloading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-gradient py-3 text-sm font-semibold text-primary-foreground shadow-brand disabled:opacity-70"
        >
          {downloading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
          ) : downloaded ? (
            <><Check className="h-4 w-4" /> Downloaded!</>
          ) : (
            <><Download className="h-4 w-4" /> Download My Shortcut</>
          )}
        </button>

        {/* Token (advanced / backup) */}
        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-muted-foreground underline-offset-2 hover:underline">
            Advanced: view save token
          </summary>
          <div className="mt-3 rounded-xl border bg-accent/30 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Save token</p>
            {tokenLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : (
              <div className="flex flex-col gap-2">
                <code className="block break-all rounded-lg bg-background px-3 py-2 text-[11px] font-mono text-foreground border">
                  {revealed ? token : token.slice(0, 12) + "•".repeat(Math.max(0, token.length - 12))}
                </code>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setRevealed(r => !r)}
                    className="text-xs text-primary underline-offset-2 hover:underline"
                  >
                    {revealed ? "Hide" : "Show full token"}
                  </button>
                  {token && <CopyButton text={token} />}
                </div>
                <p className="text-[11px] text-muted-foreground">Never expires. Treat it like a password.</p>
              </div>
            )}
          </div>
        </details>
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
