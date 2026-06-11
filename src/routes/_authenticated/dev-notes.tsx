import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dev-notes")({
  head: () => ({
    meta: [
      { title: "Video Processing Needed — Dev Handoff" },
      {
        name: "description",
        content:
          "Backend architecture and developer handoff notes for processing TikTok and Instagram Reel content in STASHd.",
      },
    ],
  }),
  component: DevNotesPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="text-sm text-muted-foreground space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" | "ok" }) {
  const cls =
    tone === "warn"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : tone === "ok"
        ? "bg-primary/10 text-primary border-primary/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function DevNotesPage() {
  const placeholders: { field: string; column: string; status: "stub" | "ready" }[] = [
    { field: "Caption", column: "items.original_caption", status: "ready" },
    { field: "Transcript (video text)", column: "items.transcript", status: "stub" },
    { field: "Audio transcript", column: "items.transcript (reuse)", status: "stub" },
    { field: "Creator username", column: "items.creator_name", status: "ready" },
    { field: "AI recipe ingredients", column: "items.recipe_ingredients", status: "ready" },
    { field: "AI recipe steps", column: "items.recipe_steps", status: "ready" },
    { field: "AI recipe nutrition", column: "items.recipe_nutrition", status: "ready" },
    { field: "Product names", column: "items.product_names", status: "ready" },
    { field: "Travel details", column: "items.travel_details (jsonb)", status: "ready" },
    { field: "Key takeaways", column: "items.ai_key_takeaways", status: "ready" },
    { field: "Confidence score", column: "items.confidence_score", status: "ready" },
    { field: "Processing status", column: "items.processing_status", status: "ready" },
    { field: "Source platform", column: "items.source_platform", status: "ready" },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
      <header className="space-y-3">
        <Pill tone="warn">Internal · Developer handoff</Pill>
        <h1 className="text-3xl font-bold tracking-tight">Video Processing Needed</h1>
        <p className="text-muted-foreground">
          STASHd cannot reliably understand TikTok or Instagram Reel content from URL metadata alone.
          Reels and TikToks intentionally expose almost nothing to scrapers: no caption in OG tags, no
          transcript, no audio. To actually understand a reel we need a real video processing pipeline.
        </p>
      </header>

      <Section title="What's required to understand a reel">
        <ul className="list-disc pl-5 space-y-1">
          <li>A video / caption extraction service (e.g. yt-dlp worker, Apify, RapidAPI TikTok/IG endpoints)</li>
          <li>Audio transcription (Whisper, Deepgram, or OpenAI gpt-4o-transcribe)</li>
          <li>AI summarization over the transcript + caption (Lovable AI gateway — Gemini / GPT-5)</li>
          <li>Structured output for recipes, products, outfits, travel, home ideas, and workouts</li>
          <li>Fallback manual notes when extraction fails — never block the save</li>
        </ul>
      </Section>

      <Section title="Pipeline (target state)">
        <pre className="rounded-md border bg-muted/40 p-3 text-xs overflow-x-auto">{`save url
  → detectPlatform()                       [done]
  → fetchMetadata() (OG/Twitter)           [done — usually empty for IG/TikTok]
  → extractor.fetchCaption(url)            [TODO — external service]
  → extractor.fetchVideo(url)              [TODO — external service / signed mp4]
  → transcribe(audio)                      [TODO — Whisper/Deepgram]
  → aiCategorize({caption, transcript})    [done — gated on real text]
  → persist structured fields              [done]
  → status: ai_processed | needs_user_context | failed`}</pre>
      </Section>

      <Section title="Current honesty rules (already enforced)">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <code>share-ingest.server.ts</code> marks opaque video saves as
            <code className="mx-1">processing_status = "needs_user_context"</code> when there is no
            caption, transcript, note, or user hint.
          </li>
          <li>
            The AI prompt forbids inventing dishes, products, brands, or locations that aren't in the
            provided text. Confidence score must drop to ≤ 0.3 for bare video IDs.
          </li>
          <li>
            Ask My STASHd only answers from saved fields and tells the user when a note/category is
            missing — it does not hallucinate from a URL.
          </li>
        </ul>
      </Section>

      <Section title="DB placeholders ready for the extractor">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">Column</th>
                <th className="px-3 py-2 font-medium">Wired</th>
              </tr>
            </thead>
            <tbody>
              {placeholders.map((p) => (
                <tr key={p.field} className="border-t">
                  <td className="px-3 py-2">{p.field}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.column}</td>
                  <td className="px-3 py-2">
                    {p.status === "ready" ? (
                      <Pill tone="ok">written by AI</Pill>
                    ) : (
                      <Pill tone="warn">awaiting extractor</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Processing status state machine">
        <ul className="list-disc pl-5 space-y-1">
          <li><code>pending</code> — row created, nothing fetched yet</li>
          <li><code>metadata_found</code> — OG/Twitter tags returned something</li>
          <li><code>transcript_found</code> — extractor returned caption or transcript</li>
          <li><code>ai_processed</code> — AI categorized using real text</li>
          <li><code>needs_user_context</code> — opaque social video, prompt user for a note</li>
          <li><code>failed</code> — hard error; save still succeeded as Uncategorized</li>
        </ul>
      </Section>

      <Section title="Where to plug in the extractor">
        <p>
          In <code>src/lib/share-ingest.server.ts</code>, look for the comment{" "}
          <code>"Transcript: not yet implemented"</code>. Replace the{" "}
          <code>const transcript: string | null = null</code> block with a call to the extractor
          service, then set <code>processingStatus = "transcript_found"</code> before the AI call.
          The AI prompt, schema, and persistence already accept caption + transcript and write all
          structured fields — no changes needed downstream.
        </p>
        <p>
          Recommended split: a background worker (queue + cron route under{" "}
          <code>/api/public/jobs/process-video</code>) that picks rows where{" "}
          <code>processing_status in ('pending','needs_user_context')</code> and the platform is a
          video platform, runs extraction + transcription, then re-runs <code>aiCategorize</code>.
        </p>
      </Section>

      <Section title="What we will NOT do">
        <ul className="list-disc pl-5 space-y-1">
          <li>Guess recipe ingredients, product names, or destinations from a bare TikTok/IG URL.</li>
          <li>Claim "AI organized this save" when only the URL was available.</li>
          <li>Block the save flow if extraction or AI fails — always save the link.</li>
        </ul>
      </Section>

      <BackfillTitlesPanel />
    </div>
  );
}

function BackfillTitlesPanel() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<{ processed: number; updated: number; skipped: number; errors: number } | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function runBackfill() {
    setStatus("running");
    setResult(null);
    setErrMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/public/items/backfill-titles", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setResult({ processed: json.processed, updated: json.updated, skipped: json.skipped, errors: json.errors });
      setStatus("done");
    } catch (e: any) {
      setErrMsg(e?.message || "Backfill failed");
      setStatus("error");
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <h2 className="text-xl font-semibold text-foreground">Backfill Video Titles</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Finds all your saves titled "Instagram Reel", "TikTok Video", etc. and regenerates
        descriptive titles from stored caption, transcript, and category metadata.
        Each updated title is logged with <code>[INGEST-TITLE]</code>.
      </p>
      <button
        onClick={runBackfill}
        disabled={status === "running"}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {status === "running" ? "Running…" : "Run Backfill"}
      </button>
      {status === "done" && result && (
        <div className="rounded-md border bg-background p-3 text-sm font-mono space-y-1">
          <div>processed: <span className="font-semibold">{result.processed}</span></div>
          <div className="text-green-600 dark:text-green-400">updated: <span className="font-semibold">{result.updated}</span></div>
          <div>skipped: <span className="font-semibold">{result.skipped}</span></div>
          {result.errors > 0 && <div className="text-destructive">errors: <span className="font-semibold">{result.errors}</span></div>}
        </div>
      )}
      {status === "error" && (
        <p className="text-sm text-destructive">{errMsg}</p>
      )}
    </section>
  );
}
