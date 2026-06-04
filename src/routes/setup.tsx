import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Share2, CheckCircle2, Copy, Check, ChevronRight, Smartphone } from "lucide-react";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Set up iPhone Shortcut — STASHd" },
      { name: "description", content: "Install the STASHd iOS Shortcut to save from Instagram, TikTok, Safari, and any app in one tap." },
    ],
  }),
  component: SetupPage,
});

const steps = [
  {
    number: "1",
    title: "Enable untrusted shortcuts",
    detail: "Open Settings → Shortcuts → toggle on Allow Untrusted Shortcuts. You only need to do this once.",
    note: "If the toggle is already on, skip this step.",
  },
  {
    number: "2",
    title: "Download the STASHd Shortcut",
    detail: "Tap the button below. Safari will download a .shortcut file and open the Shortcuts app automatically.",
    note: 'Tap "Add Untrusted Shortcut" on the preview screen to confirm.',
  },
  {
    number: "3",
    title: "Share any link into STASHd",
    detail: "Open Instagram, TikTok, YouTube, Safari, or Pinterest. Tap the Share icon on any post or page, scroll to find STASHd in the share sheet, and tap it.",
    note: 'The Shortcut may appear under "More" the first time.',
  },
  {
    number: "4",
    title: "Watch it save",
    detail: 'STASHd opens in Safari, categorizes the save with AI, and shows "Saved to STASHd." within a few seconds.',
    note: "Sign in once if prompted — your share will resume automatically after login.",
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-card transition hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied!" : "Copy URL"}
    </button>
  );
}

function SetupPage() {
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${appUrl}/share?url=YOUR_URL_HERE`;

  return (
    <div className="min-h-screen bg-soft-gradient">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/"><Logo /></Link>
        <Link to="/auth" className="rounded-full border bg-card px-5 py-2 text-sm font-semibold shadow-card hover:bg-accent">
          Sign In
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-6 pb-20 pt-8">

        {/* Hero */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-gradient text-primary-foreground shadow-brand">
            <Smartphone className="h-8 w-8" />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-widest text-primary">
            iOS SHORTCUT SETUP
          </div>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Save from iPhone in one tap.</h1>
          <p className="mt-3 text-muted-foreground">
            Install the STASHd Shortcut and it appears in your iPhone Share Sheet. Tap it from Instagram, TikTok, YouTube, Pinterest, Safari — anywhere.
          </p>
        </div>

        {/* Download CTA */}
        <div className="mb-10 rounded-3xl border bg-card p-6 shadow-card text-center">
          <p className="mb-1 text-xs font-bold tracking-widest text-primary">STEP 2 STARTS HERE</p>
          <h2 className="text-xl font-bold">Download the Shortcut</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tap on your iPhone in Safari for the best experience.</p>
          <a
            href="/STASHd.shortcut"
            download="STASHd.shortcut"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-gradient px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-brand transition hover:translate-y-[-1px]"
          >
            <Download className="h-4 w-4" />
            Get the STASHd Shortcut
          </a>
          <p className="mt-3 text-xs text-muted-foreground">Free · No account required to install · Works on iOS 15+</p>
        </div>

        {/* Step by step */}
        <div className="mb-10">
          <h2 className="mb-5 text-lg font-bold">Setup guide</h2>
          <div className="space-y-4">
            {steps.map((s, i) => (
              <div key={i} className="flex gap-4 rounded-2xl border bg-card p-5 shadow-card">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-primary-foreground shadow-brand">
                  {s.number}
                </div>
                <div>
                  <h3 className="font-bold">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{s.detail}</p>
                  {s.note && (
                    <p className="mt-2 text-xs text-primary/80 font-medium">💡 {s.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Works with */}
        <div className="mb-10 rounded-3xl border bg-card p-6 shadow-card">
          <h2 className="mb-4 font-bold flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" /> Works with any app that has a Share button
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {["Instagram", "TikTok", "YouTube", "Safari", "Pinterest", "X / Twitter", "Reddit", "Facebook", "Any website"].map((app) => (
              <div key={app} className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                {app}
              </div>
            ))}
          </div>
        </div>

        {/* Manual alternative */}
        <details className="group rounded-3xl border bg-card shadow-card">
          <summary className="flex cursor-pointer items-center justify-between p-6 font-bold">
            Build it manually instead
            <ChevronRight className="h-4 w-4 text-muted-foreground transition group-open:rotate-90" />
          </summary>
          <div className="border-t px-6 pb-6 pt-5 space-y-4 text-sm text-muted-foreground">
            <p>If the download doesn't work, create the shortcut yourself in under 2 minutes:</p>
            <ol className="space-y-3 list-decimal pl-4">
              <li>Open the <strong className="text-foreground">Shortcuts</strong> app → tap <strong className="text-foreground">+</strong> to create a new shortcut.</li>
              <li>Tap <strong className="text-foreground">Add Action</strong> → search for <strong className="text-foreground">"URL Encode"</strong> → select it. Set Mode to <strong className="text-foreground">Encode</strong>. Set Input to <strong className="text-foreground">Shortcut Input</strong>.</li>
              <li>Add another action: search for <strong className="text-foreground">"Open URLs"</strong>. In the URL field type the base URL below, then tap the variable picker and insert the <strong className="text-foreground">URL Encode</strong> result.</li>
              <li>Tap the shortcut name at the top → rename it <strong className="text-foreground">STASHd</strong>.</li>
              <li>Tap <strong className="text-foreground">Share icon → Add to Home Screen</strong> or just leave it in Shortcuts.</li>
            </ol>
            <div className="rounded-xl bg-muted/60 p-3">
              <p className="mb-2 text-xs font-bold text-foreground">Base URL to paste in the Open URLs action:</p>
              <code className="block break-all text-xs font-mono text-foreground">{appUrl}/share?url=</code>
              <div className="mt-2">
                <CopyButton text={`${appUrl}/share?url=`} />
              </div>
            </div>
          </div>
        </details>

        {/* Test section */}
        <div className="mt-8 rounded-3xl border bg-card p-6 shadow-card">
          <h2 className="mb-2 font-bold">Test it now</h2>
          <p className="text-sm text-muted-foreground mb-4">You can also test the save page directly from any browser by visiting a URL like:</p>
          <div className="rounded-xl bg-muted/60 p-3 text-xs font-mono break-all text-foreground">
            {appUrl}/share?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ
          </div>
          <div className="mt-3">
            <a
              href={`/share?url=${encodeURIComponent("https://www.youtube.com/watch?v=dQw4w9WgXcQ")}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-brand"
            >
              Test a save now <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

      </main>

      <footer className="border-t py-8 text-center text-xs tracking-widest text-muted-foreground">
        © {new Date().getFullYear()} STASHd
      </footer>
    </div>
  );
}
