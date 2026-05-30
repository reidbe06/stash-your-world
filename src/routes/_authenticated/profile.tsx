import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Mail, Bell, Lock, HelpCircle, ChevronRight, Sparkles, Chrome, Download, Share2, Smartphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AvatarUploader } from "@/components/AvatarUploader";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile & Settings — STASHd" }] }),
  component: Profile,
});

type Setting = { icon: LucideIcon; label: string; hint: string; onClick?: () => void };

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
      <div className="rounded-3xl border bg-card p-8 text-center shadow-card">
        <AvatarUploader />
        <h1 className="mt-4 text-xl font-bold">{user?.email}</h1>
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Mail className="h-3 w-3" /> Verified member
        </p>
      </div>

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

      <ChromeExtensionCard />
      <MobileShareCard />

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

      <button
        onClick={() => supabase.auth.signOut()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border bg-card py-3 text-sm font-semibold shadow-card hover:bg-accent"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}

function ChromeExtensionCard() {
  const handleDownload = () => {
    fetch("/save-to-stashd.zip")
      .then((res) => {
        if (!res.ok) throw new Error(`Download failed (${res.status})`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "save-to-stashd.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => alert(err.message));
  };

  return (
    <div className="rounded-3xl border bg-card p-6 shadow-card">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-primary-foreground shadow-brand">
          <Chrome className="h-6 w-6" />
        </span>
        <div className="flex-1">
          <h2 className="text-base font-bold">Save to STASHd — Chrome Extension</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Save any page in one click. Auto-captures the title, image, description, and runs AI categorization.
          </p>
        </div>
      </div>
      <button
        onClick={handleDownload}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-gradient py-3 text-sm font-semibold text-primary-foreground shadow-brand"
      >
        <Download className="h-4 w-4" /> Download extension
      </button>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">How to install</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Unzip the downloaded file.</li>
          <li>Open <code className="rounded bg-accent px-1 py-0.5">chrome://extensions</code> in Chrome.</li>
          <li>Enable <strong>Developer mode</strong> (top-right).</li>
          <li>Click <strong>Load unpacked</strong> and select the unzipped folder.</li>
          <li>Pin the extension and sign in with your STASHd account.</li>
        </ol>
      </details>
    </div>
  );
}

function MobileShareCard() {
  return (
    <div className="rounded-3xl border bg-card p-6 shadow-card">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-primary-foreground shadow-brand">
          <Share2 className="h-6 w-6" />
        </span>
        <div className="flex-1">
          <h2 className="text-base font-bold">Share to STASHd — Mobile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap Share in Instagram, TikTok, Pinterest, YouTube, Safari or Chrome and send the link straight to STASHd. AI handles the rest.
          </p>
        </div>
      </div>

      <details className="mt-4 text-xs text-muted-foreground" open>
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          <Smartphone className="mr-1 inline h-4 w-4" /> Android &amp; Chrome
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Open STASHd in Chrome on your phone.</li>
          <li>Tap the menu and choose <strong>Install app</strong> / <strong>Add to Home screen</strong>.</li>
          <li>From any app, tap <strong>Share</strong> → pick <strong>STASHd</strong>. We save and categorize instantly.</li>
        </ol>
      </details>

      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          <Smartphone className="mr-1 inline h-4 w-4" /> iPhone &amp; iPad
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Open STASHd in Safari and tap <strong>Share → Add to Home Screen</strong>.</li>
          <li>From any app, tap <strong>Share → Copy</strong>, then open STASHd and tap <strong>Paste link</strong>.</li>
          <li>Or set up an iOS Shortcut that POSTs to your STASHd share API for true one-tap saving.</li>
        </ol>
      </details>
    </div>
  );
}
