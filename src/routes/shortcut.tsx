// Public Shortcut download/install landing page — no auth required.
// Designed for iPhone: tapping "Add to Shortcuts" downloads the .shortcut
// file which iOS automatically opens in the Shortcuts app.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Logo } from "@/components/Logo";
import {
  Download,
  Share2,
  Sparkles,
  BellRing,
  ShieldCheck,
  ChevronRight,
  Instagram,
  Youtube,
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

const steps = [
  {
    n: "1",
    heading: "Download the Shortcut",
    body: "Tap the button below. iOS opens the Shortcuts app and shows you exactly what the shortcut does before you add it.",
  },
  {
    n: "2",
    heading: "Paste your save token",
    body: "When prompted, open STASHd → Profile → iOS Shortcut section and copy your personal save token. Paste it once — Shortcuts remembers it forever.",
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

function ShortcutPage() {
  const isIOS = useIsIOS();

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
        <a
          href="/STASHd.shortcut"
          download="STASHd.shortcut"
          className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-full bg-brand-gradient py-4 text-base font-bold text-primary-foreground shadow-brand transition active:scale-95"
        >
          <Download className="h-5 w-5 shrink-0" />
          {isIOS ? "Add to Shortcuts" : "Download Shortcut"}
        </a>

        {!isIOS && (
          <p className="mt-2 text-xs text-muted-foreground">
            Open this page on your iPhone for the best experience.
          </p>
        )}

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
        <a
          href="/STASHd.shortcut"
          download="STASHd.shortcut"
          className="mt-10 flex w-full items-center justify-center gap-2.5 rounded-full bg-brand-gradient py-4 text-base font-bold text-primary-foreground shadow-brand transition active:scale-95"
        >
          <Download className="h-5 w-5 shrink-0" />
          {isIOS ? "Add to Shortcuts" : "Download Shortcut"}
        </a>

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
