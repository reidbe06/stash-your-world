import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Share2, CheckCircle2, Copy, Check, ChevronRight, Smartphone, ExternalLink } from "lucide-react";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Set up iPhone Shortcut — STASHd" },
      { name: "description", content: "Save from Instagram, TikTok, Safari, and any app into STASHd with one tap from the iPhone Share menu." },
    ],
  }),
  component: SetupPage,
});

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm transition hover:text-foreground active:scale-95"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-primary-foreground shadow-brand">
        {n}
      </div>
      <div className="pt-1 flex-1">
        <p className="font-bold text-base">{title}</p>
        <div className="mt-1.5 text-sm text-muted-foreground leading-relaxed space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-lg border bg-muted/60 px-2 py-0.5 text-xs font-semibold text-foreground">
      {children}
    </span>
  );
}

function SetupPage() {
  const [appUrl, setAppUrl] = useState("");
  useEffect(() => { setAppUrl(window.location.origin); }, []);
  const shareBase = `${appUrl}/share?url=`;
  const testUrl = `${appUrl}/share?url=${encodeURIComponent("https://www.youtube.com/watch?v=dQw4w9WgXcQ")}`;

  return (
    <div className="min-h-screen bg-soft-gradient">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/"><Logo /></Link>
        <Link to="/auth" className="rounded-full border bg-card px-5 py-2 text-sm font-semibold shadow-card hover:bg-accent">
          Sign In
        </Link>
      </header>

      <main className="mx-auto max-w-xl px-5 pb-20 pt-8">

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
            Create a Shortcut in the iOS Shortcuts app — it then appears in your Share Sheet in every app.
          </p>
        </div>

        {/* Time callout */}
        <div className="mb-8 flex items-center justify-center gap-3 rounded-2xl border bg-card px-5 py-3 shadow-card">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm font-medium">Takes about 2 minutes. You do this once and it works forever.</p>
        </div>

        {/* Steps */}
        <div className="mb-10 space-y-8 rounded-3xl border bg-card p-6 shadow-card">
          <Step n="1" title="Open the Shortcuts app">
            <p>On your iPhone, find and open the <Pill>Shortcuts</Pill> app (it comes pre-installed on all iPhones).</p>
            <p>Tap <Pill>+</Pill> in the top-right corner to create a new shortcut.</p>
          </Step>

          <div className="border-t" />

          <Step n="2" title="Add the URL Encode action">
            <p>Tap <Pill>Add Action</Pill>.</p>
            <p>In the search bar, type <Pill>URL Encode</Pill> and tap it to add it.</p>
            <p>In the action that appears, make sure:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><span className="font-semibold text-foreground">Input</span> is set to <Pill>Shortcut Input</Pill></li>
              <li><span className="font-semibold text-foreground">Encode / Decode</span> is set to <Pill>Encode</Pill></li>
            </ul>
          </Step>

          <div className="border-t" />

          <Step n="3" title='Add the "Open URLs" action'>
            <p>Tap <Pill>Add Action</Pill> again.</p>
            <p>Search for <Pill>Open URLs</Pill> and tap it.</p>
            <p>In the URL field:</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Tap the URL field so the keyboard appears.</li>
              <li>Type or paste the base URL below (copy it first):</li>
            </ol>
            <div className="rounded-xl bg-muted/60 px-3 py-2.5 font-mono text-xs text-foreground break-all">
              {shareBase}
            </div>
            <div className="mt-1.5">
              <CopyButton text={shareBase} label="Copy base URL" />
            </div>
            <p className="mt-2">After pasting, tap the <Pill>Variable</Pill> button (looks like a blue chip or magic wand icon at the right of the keyboard), then select <Pill>URL Encode</Pill> — this inserts the output of step 2 at the end of the URL.</p>
          </Step>

          <div className="border-t" />

          <Step n="4" title="Enable it in the Share Sheet">
            <p>Tap the shortcut name at the top (it may say "New Shortcut") and rename it to <Pill>STASHd</Pill>.</p>
            <p>Tap <Pill>⋯</Pill> (the three-dot icon, top-right of the shortcut editor).</p>
            <p>In the details panel, tap <Pill>Add to Share Sheet</Pill>. Set the input type to <Pill>URLs</Pill>.</p>
            <p>Tap <Pill>Done</Pill>.</p>
          </Step>

          <div className="border-t" />

          <Step n="5" title="Use it">
            <p>Open Instagram, TikTok, YouTube, Pinterest, Safari, or any app with a Share button.</p>
            <p>Tap <Pill>Share ↑</Pill> on any post or page → scroll until you see <Pill>STASHd</Pill> → tap it.</p>
            <p>Safari opens and STASHd saves the link automatically.</p>
            <p className="text-xs text-primary/80 font-medium">💡 If STASHd doesn&apos;t appear, scroll to the bottom of the share sheet and tap <Pill>More</Pill> to find and enable it.</p>
          </Step>
        </div>

        {/* Supported apps */}
        <div className="mb-8 rounded-3xl border bg-card p-6 shadow-card">
          <h2 className="mb-4 font-bold flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" />
            Works in any app with a Share button
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

        {/* Test section */}
        <div className="rounded-3xl border bg-card p-6 shadow-card">
          <h2 className="mb-1 font-bold">Test the save flow now</h2>
          <p className="text-sm text-muted-foreground mb-4">
            You can verify the backend works right now — no Shortcut needed. Open this URL while signed in:
          </p>
          <div className="rounded-xl bg-muted/60 p-3 text-xs font-mono break-all text-foreground">
            {appUrl}/share?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={testUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-brand"
            >
              Test a save <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <CopyButton text={`${appUrl}/share?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ`} label="Copy test URL" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            If you&apos;re not signed in, you&apos;ll be taken to the login screen first — after signing in, the save resumes automatically.
          </p>
        </div>

      </main>

      <footer className="border-t py-8 text-center text-xs tracking-widest text-muted-foreground">
        © {new Date().getFullYear()} STASHd
      </footer>
    </div>
  );
}
