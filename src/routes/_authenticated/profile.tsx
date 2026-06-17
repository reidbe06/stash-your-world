import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LogOut, Mail, Bell, Lock, HelpCircle, ChevronRight,
  Sparkles, FolderOpen, Smartphone, Copy, Check,
  Download, Loader2, ExternalLink, Bug, AlertCircle,
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
      {copied ? "Copied!" : "Copy"}
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

type ProbeResult = {
  status: number;
  contentType: string;
  bytes: number;
  firstBytes: string;
  isValidPlist: boolean;
};

function DebugPanel({
  shortcutFileUrl,
  shortcutsDeepLink,
}: {
  shortcutFileUrl: string;
  shortcutsDeepLink: string;
}) {
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  async function runProbe() {
    setProbing(true);
    setProbeError(null);
    try {
      const res = await fetch(shortcutFileUrl);
      const status = res.status;
      const contentType = res.headers.get("content-type") ?? "(none)";
      const buf = await res.arrayBuffer();
      const bytes = buf.byteLength;
      const arr = new Uint8Array(buf.slice(0, 40));
      const firstBytes = Array.from(arr)
        .map(b => b.toString(16).padStart(2, "0"))
        .join(" ");
      const text = new TextDecoder().decode(arr);
      const isValidPlist =
        text.includes("<?xml") || text.includes("plist") ||
        (arr[0] === 0x62 && arr[1] === 0x70 && arr[2] === 0x6c && arr[3] === 0x69); // bplist
      setProbe({ status, contentType, bytes, firstBytes, isValidPlist });
    } catch (e: any) {
      setProbeError(e?.message ?? "Fetch failed");
    } finally {
      setProbing(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-dashed border-violet-400/60 bg-violet-50 px-4 py-3 text-xs dark:bg-violet-950/20 space-y-3">
      <div className="flex items-center gap-1.5 font-semibold text-violet-700 dark:text-violet-300">
        <Bug className="h-3.5 w-3.5" /> Debug — Shortcut file
      </div>

      <div className="space-y-1.5">
        <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">.shortcut file URL</p>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="break-all rounded bg-background px-2 py-1 text-[10px] font-mono border flex-1">
            {shortcutFileUrl}
          </code>
          <CopyButton text={shortcutFileUrl} />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">shortcuts:// deep link</p>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="break-all rounded bg-background px-2 py-1 text-[10px] font-mono border flex-1">
            {shortcutsDeepLink}
          </code>
          <CopyButton text={shortcutsDeepLink} />
        </div>
        <a
          href={shortcutsDeepLink}
          className="inline-flex items-center gap-1 text-violet-700 dark:text-violet-300 underline underline-offset-2 font-semibold"
        >
          <ExternalLink className="h-3 w-3" /> Open in Shortcuts again
        </a>
      </div>

      <div className="space-y-1.5">
        <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">URL probe</p>
        <button
          onClick={runProbe}
          disabled={probing}
          className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm transition hover:text-foreground disabled:opacity-60"
        >
          {probing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {probing ? "Probing…" : "Check URL now"}
        </button>

        {probeError && (
          <p className="text-red-600 dark:text-red-400 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {probeError}
          </p>
        )}

        {probe && (
          <div className="rounded-lg border bg-background p-2 font-mono text-[10px] space-y-1">
            <p>
              <span className="text-muted-foreground">HTTP status:&nbsp;</span>
              <span className={probe.status === 200 ? "text-green-600 dark:text-green-400 font-bold" : "text-red-600 font-bold"}>
                {probe.status}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Content-Type:&nbsp;</span>
              <span className={probe.contentType.includes("html") ? "text-red-600 font-bold" : "text-green-600 dark:text-green-400 font-bold"}>
                {probe.contentType}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">File size:&nbsp;</span>
              {probe.bytes} bytes
            </p>
            <p>
              <span className="text-muted-foreground">First 40 bytes:&nbsp;</span>
              {probe.firstBytes}
            </p>
            <p>
              <span className="text-muted-foreground">Valid plist:&nbsp;</span>
              <span className={probe.isValidPlist ? "text-green-600 dark:text-green-400 font-bold" : "text-red-600 font-bold"}>
                {probe.isValidPlist ? "✓ yes" : "✗ no (not a plist file!)"}
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function IOSShortcutSection() {
  const { user } = useAuth();
  const isIOS = useIsIOS();
  const [revealed, setRevealed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState<"idle" | "opening" | "downloaded" | "error">("idle");
  const [shortcutsLink, setShortcutsLink] = useState<string | null>(null);
  const [shortcutFileUrl, setShortcutFileUrl] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

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
    if (isIOS) {
      // iOS path:
      //  1. POST to /api/me/shortcut-upload (authenticated) — generates
      //     the plist and stores it in Supabase Storage as a clean public URL
      //     ending in /STASHd.shortcut with no query string.
      //  2. Open shortcuts://import-shortcut?url=<encoded-supabase-url>
      //     iOS Shortcuts fetches directly from Storage — no auth, no redirect.
      setDownloading(true);
      setStatus("idle");
      try {
        const { data: sess } = await supabase.auth.getSession();
        const bearer = sess.session?.access_token;
        if (!bearer) throw new Error("Not signed in");

        const res = await fetch("/api/me/shortcut-upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${bearer}` },
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Upload failed (${res.status}): ${text}`);
        }

        const { url, shortcutsDeepLink } = await res.json() as {
          url: string;
          shortcutsDeepLink: string;
        };

        setShortcutFileUrl(url);
        setShortcutsLink(shortcutsDeepLink);
        setStatus("opening");
        window.location.href = shortcutsDeepLink;
        setTimeout(() => setStatus("opening"), 3000);
      } catch (err: any) {
        console.error("[shortcut] download failed:", err);
        setStatus("error");
        setTimeout(() => setStatus("idle"), 5000);
      } finally {
        setDownloading(false);
      }
    } else {
      // Desktop / non-iOS: fetch binary and trigger browser download
      setDownloading(true);
      setStatus("idle");
      try {
        const { data: sess } = await supabase.auth.getSession();
        const bearer = sess.session?.access_token;
        if (!bearer) throw new Error("Not signed in");

        const res = await fetch("/api/me/shortcut", {
          headers: { Authorization: `Bearer ${bearer}` },
        });
        if (!res.ok) throw new Error(await res.text());

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = "STASHd.shortcut";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        setStatus("downloaded");
        setTimeout(() => setStatus("idle"), 4000);
      } catch (err) {
        console.error("Download failed", err);
        setStatus("error");
        setTimeout(() => setStatus("idle"), 4000);
      } finally {
        setDownloading(false);
      }
    }
  }

  const buttonDisabled = downloading || (isIOS && tokenLoading);

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
          disabled={buttonDisabled}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-gradient py-3 text-sm font-semibold text-primary-foreground shadow-brand disabled:opacity-70"
        >
          {downloading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
          ) : status === "opening" ? (
            <><ExternalLink className="h-4 w-4" /> Opening Shortcuts…</>
          ) : status === "downloaded" ? (
            <><Check className="h-4 w-4" /> Downloaded!</>
          ) : status === "error" ? (
            <><Download className="h-4 w-4" /> Try Again</>
          ) : (
            <><Download className="h-4 w-4" /> Download My Shortcut</>
          )}
        </button>

        {/* Fallback link after navigation attempt */}
        {isIOS && status === "opening" && shortcutsLink && (
          <div className="rounded-xl border border-dashed border-amber-400/60 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 space-y-2">
            <p className="font-semibold">Shortcuts didn't open automatically?</p>
            <a
              href={shortcutsLink}
              className="flex items-center gap-1.5 font-semibold underline underline-offset-2"
            >
              <ExternalLink className="h-3 w-3 shrink-0" /> Open in Shortcuts
            </a>
          </div>
        )}

        {/* Debug panel — shows after a successful upload */}
        {isIOS && shortcutFileUrl && shortcutsLink && (
          <div>
            <button
              onClick={() => setShowDebug(d => !d)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {showDebug ? "Hide debug info" : "Show debug info"}
            </button>
            {showDebug && (
              <DebugPanel
                shortcutFileUrl={shortcutFileUrl}
                shortcutsDeepLink={shortcutsLink}
              />
            )}
          </div>
        )}

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
