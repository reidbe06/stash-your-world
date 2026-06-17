// Public Shortcut landing page — no auth required.
// Links to the Apple-signed iCloud shortcut URL; never serves a raw plist file.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Logo } from "@/components/Logo";
import {
  Download,
  Sparkles,
  BellRing,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/shortcut")({
  head: () => ({
    meta: [
      { title: "Save to STASHd — iOS Shortcut" },
      {
        name: "description",
        content:
          "One tap to save anything from Instagram, TikTok, Pinterest, Safari or YouTube. AI organises it automatically.",
      },
      { property: "og:title", content: "Save to STASHd — iOS Shortcut" },
      {
        property: "og:description",
        content: "One tap to stash anything. AI organises it automatically.",
      },
    ],
  }),
  component: ShortcutPage,
});

function useIsIOS() {
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
  }, []);
  return isIOS;
}

// Set to the published iCloud URL once the shortcut is created in the
// iOS Shortcuts app and shared via "Copy iCloud Link".
const ICLOUD_SHORTCUT_URL: string | null = null;

const steps = [
  {
    n: "1",
    heading: "Copy your save token",
    body: "Open STASHd → Profile → iOS Shortcut → tap \"Copy My Token\". It goes to your clipboard.",
  },
  {
    n: "2",
    heading: "Add the Shortcut",
    body: "Tap Add to Shortcuts below. When it asks \"Paste your STASHd token\", paste from clipboard. That's it — Shortcuts remembers it forever.",
  },
  {
    n: "3",
    heading: "Share from any app",
    body: "Open a link in Instagram, TikTok, Pinterest, Safari, YouTube or anywhere else → tap the Share button → Save to STASHd. Done in one tap.",
  },
];

const works = [
  { icon: "📸", label: "Instagram" },
  { icon: "🎵", label: "TikTok" },
  { icon: "📌", label: "Pinterest" },
  { icon: "🧭", label: "Safari" },
  { icon: "▶️", label: "YouTube" },
  { icon: "🛍️", label: "Shopping" },
];

function DownloadButton({ label }: { label: string }) {
  const [triggered, setTriggered] = useState(false);

  function handleClick() {
    if (!ICLOUD_SHORTCUT_URL) return;
    setTriggered(true);
    const deepLink = `shortcuts://import-shortcut?url=${encodeURIComponent(ICLOUD_SHORTCUT_URL)}`;
    window.location.href = deepLink;
  }

  if (!ICLOUD_SHORTCUT_URL) {
    return (
      <div className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-full border border-dashed py-4 text-base font-bold text-muted-foreground cursor-not-allowed opacity-60">
        <Download className="h-5 w-5 shrink-0" /> Coming soon
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleClick}
        className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-full bg-brand-gradient py-4 text-base font-bold text-primary-foreground shadow-brand transition active:scale-95"
      >
        <ExternalLink className="h-5 w-5 shrink-0" />
        {label}
      </button>

      {triggered && ICLOUD_SHORTCUT_URL && (
        <div className="rounded-xl border border-dashed border-amber-400/60 bg-amber-50 px-4 py-3 text-xs text-amber-800 text-left space-y-1.5">
          <p className="font-semibold">Shortcuts didn't open automatically?</p>
          <a
            href={`shortcuts://import-shortcut?url=${encodeURIComponent(ICLOUD_SHORTCUT_URL)}`}
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            Open in Shortcuts
          </a>
        </div>
      )}

    </div>
  );
}

function ShortcutPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur-md sticky top-0 z-20">
        <Link to="/" className="flex items-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="font-bold tracking-tight">STASHd</span>
        </Link>
        <Link
          to="/auth"
          className="rounded-full bg-brand-gradient px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-brand"
        >
          Sign in
        </Link>
      </nav>

      <main className="mx-auto max-w-md px-4 pb-16 pt-10 text-center">
        {/* Hero */}
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-gradient shadow-brand text-4xl">
          📲
        </div>

        <h1 className="text-3xl font-extrabold leading-tight">
          Save to STASHd
          <br />
          <span className="text-brand-gradient">in one tap.</span>
        </h1>

        <p className="mt-3 text-base text-muted-foreground">
          An iOS Shortcut that grabs the link from any app's share sheet and
          saves it to your STASHd — no Safari, no sign-in prompt, just a
          native notification confirming it's saved.
        </p>

        {/* Download CTA */}
        <DownloadButton label="Add to Shortcuts" />

        {/* Works with */}
        <div className="mt-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Works with
          </p>
          <div className="grid grid-cols-3 gap-3">
            {works.map((w) => (
              <div
                key={w.label}
                className="flex flex-col items-center gap-1.5 rounded-2xl border bg-card py-3 shadow-sm"
              >
                <span className="text-2xl">{w.icon}</span>
                <span className="text-xs font-medium text-muted-foreground">
                  {w.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="mt-12 text-left">
          <h2 className="mb-5 text-lg font-bold">Setup takes 60 seconds</h2>
          <ol className="space-y-5">
            {steps.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-primary-foreground shadow-brand">
                  {s.n}
                </span>
                <div>
                  <p className="font-semibold leading-snug">{s.heading}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Features */}
        <div className="mt-12 space-y-3 text-left">
          {[
            {
              icon: Sparkles,
              heading: "AI organises automatically",
              body: "Category, tags and summary appear in seconds — you just share.",
            },
            {
              icon: BellRing,
              heading: "Native notification",
              body: "A quiet banner confirms the save. No browser, no redirect.",
            },
            {
              icon: ShieldCheck,
              heading: "Permanent token, no re-login",
              body: "Your save token never expires. Set it once and forget about it.",
            },
          ].map(({ icon: Icon, heading, body }) => (
            <div
              key={heading}
              className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">{heading}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Second CTA */}
        <DownloadButton label="Add to Shortcuts" />

        <p className="mt-4 text-xs text-muted-foreground">
          Need an account?{" "}
          <Link to="/auth" className="text-primary underline-offset-2 hover:underline">
            Sign up free →
          </Link>
        </p>
      </main>
    </div>
  );
}
