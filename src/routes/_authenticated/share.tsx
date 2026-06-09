// PWA Web Share Target landing page + iOS Shortcut / clipboard fallback.
//
// Flow A — share sheet (Android PWA, Safari Web Share):
//   1. User taps Share → STASHd in share sheet
//   2. OS navigates to /share?url=...&title=...&text=...
//   3. Page auto-saves with instant=true → "Saved!" appears in ~500 ms
//   4. AI enriches in background; page redirects to dashboard after 3 s
//
// Flow B — iOS Shortcut (direct API call, no browser):
//   The Shortcut POSTs directly to /api/public/share/save.
//   This page is not involved.
//
// Flow C — clipboard paste (iOS fallback when Shortcut isn't installed):
//   User opens STASHd, navigates to /save (or /share), pastes URL.
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";
import { Loader2, CheckCircle2, AlertTriangle, Sparkles, Clipboard, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  url: z.string().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/share")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Saving to STASHd…" }] }),
  component: SharePage,
});

type Status =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; item: any; suggested?: string | null }
  | { state: "error"; message: string };

function SharePage() {
  const params = useSearch({ from: "/_authenticated/share" });
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [manualUrl, setManualUrl] = useState("");
  const saveCalledRef = useRef(false);

  const incomingUrl = (() => {
    if (params.url) return params.url;
    const blob = [params.text, params.title].filter(Boolean).join(" ");
    const m = blob.match(/https?:\/\/[^\s)<>"']+/i);
    return m ? m[0] : "";
  })();

  // Buffer URL to sessionStorage immediately so it survives a login redirect.
  useLayoutEffect(() => {
    if (incomingUrl) sessionStorage.setItem("stashd_pending_share", incomingUrl);
  }, [incomingUrl]);

  async function save(url: string, options?: { instant?: boolean }) {
    if (!url || !user) return;
    sessionStorage.removeItem("stashd_pending_share");
    setStatus({ state: "saving" });
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/public/share/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          url,
          title: params.title,
          text: params.text,
          instant: options?.instant ?? true,
          share_source: "pwa_share",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
      setStatus({ state: "saved", item: json.item, suggested: json.suggested_collection });
    } catch (e: any) {
      setStatus({ state: "error", message: e?.message || "Save failed" });
    }
  }

  useEffect(() => {
    if (incomingUrl && !saveCalledRef.current && user) {
      saveCalledRef.current = true;
      void save(incomingUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingUrl, user]);

  // Auto-redirect to dashboard 3 s after a successful save
  useEffect(() => {
    if (status.state !== "saved") return;
    const t = setTimeout(() => navigate({ to: "/dashboard" }), 3000);
    return () => clearTimeout(t);
  }, [status.state, navigate]);

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const m = text.match(/https?:\/\/[^\s)<>"']+/i);
      if (m) { setManualUrl(m[0]); void save(m[0]); }
      else setStatus({ state: "error", message: "No URL found in your clipboard." });
    } catch {
      setStatus({ state: "error", message: "Couldn't read clipboard. Paste a URL below." });
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">

      {status.state === "saving" && (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient text-primary-foreground shadow-brand">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
          <h1 className="mt-4 text-xl font-bold">Saving…</h1>
          <p className="mt-1 text-sm text-muted-foreground">Just a second.</p>
        </>
      )}

      {status.state === "saved" && (() => {
        const isPending = status.item?.processing_status === "pending";
        const cat = status.item?.category;
        const sub = status.item?.subcategory;
        const collection = status.suggested;
        const destination =
          cat && cat !== "Uncategorized" && cat !== "Needs Review"
            ? [cat, sub].filter(Boolean).join(" · ")
            : collection || null;
        return (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient text-primary-foreground shadow-brand">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h1 className="mt-4 text-2xl font-bold">Saved to STASHd.</h1>

            {isPending ? (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                <Sparkles className="h-3 w-3 animate-pulse" />
                AI is organizing in the background…
              </div>
            ) : destination ? (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                <Sparkles className="h-3 w-3" />
                {destination}
              </div>
            ) : null}

            {status.item?.title && (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{status.item.title}</p>
            )}

            {!isPending && status.item?.tags?.length ? (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {status.item.tags.slice(0, 6).map((t: string) => (
                  <span key={t} className="rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">#{t}</span>
                ))}
              </div>
            ) : null}

            <div className="mt-6 flex w-full flex-col gap-2">
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-gradient py-3 text-sm font-semibold text-primary-foreground shadow-brand"
              >
                View in STASHd <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="text-xs text-muted-foreground">Redirecting in a moment…</p>
            </div>
          </>
        );
      })()}

      {status.state === "error" && (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-xl font-bold">Couldn't save</h1>
          <p className="mt-2 text-sm text-muted-foreground">{status.message}</p>
          <Link to="/save" className="mt-6 rounded-full bg-brand-gradient px-6 py-3 text-sm font-semibold text-primary-foreground shadow-brand">
            Save manually
          </Link>
        </>
      )}

      {status.state === "idle" && !incomingUrl && (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient text-primary-foreground shadow-brand">
            <Clipboard className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-xl font-bold">Share to STASHd</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Paste a link or use the iOS Shortcut to send content here.
          </p>
          <button
            onClick={pasteFromClipboard}
            className="mt-5 w-full rounded-full bg-brand-gradient py-3 text-sm font-semibold text-primary-foreground shadow-brand"
          >
            Paste link from clipboard
          </button>
          <form
            className="mt-3 flex w-full gap-2"
            onSubmit={(e) => { e.preventDefault(); if (manualUrl) void save(manualUrl); }}
          >
            <input
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              type="url"
              placeholder="https://…"
              className="flex-1 rounded-full border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button type="submit" className="rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background">
              Save
            </button>
          </form>
        </>
      )}
    </div>
  );
}
