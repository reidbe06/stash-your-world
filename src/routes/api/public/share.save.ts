// Public canonical share-save endpoint. Used by:
// - Chrome extension (Save to STASHd)
// - PWA mobile share target (/share route → POSTs here)
// - iOS Shortcuts (share via Shortcut → POST URL)
// - Any future native mobile app's Share Extension / Sharesheet handler
//
// Authentication: Bearer <supabase_access_token> (per-user).
// Minimum input: { url }. Everything else is optional — server fetches
// metadata and runs AI categorization automatically.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  SHARE_SOURCES,
  ingestSharedUrl,
  getUserIdFromBearer,
} from "@/lib/share-ingest.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// Mobile share sheets sometimes hand us a plain "text" blob with a URL in it.
function extractUrl(input: { url?: string; text?: string; title?: string }): string | null {
  if (input.url) {
    try { new URL(input.url); return input.url; } catch {}
  }
  const blob = [input.text, input.title].filter(Boolean).join(" ");
  const m = blob.match(/https?:\/\/[^\s)<>"']+/i);
  return m ? m[0] : null;
}

const Schema = z.object({
  url: z.string().trim().max(2000).optional(),
  text: z.string().trim().max(4000).optional(),
  title: z.string().trim().max(500).optional(),
  description: z.string().trim().max(2000).optional(),
  image: z.string().trim().max(2000).nullable().optional(),
  source: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  context_type: z.string().trim().max(80).nullable().optional(),
  collection_id: z.string().uuid().nullable().optional(),
  share_source: z.enum(SHARE_SOURCES).optional().default("pwa_share"),
});

export const Route = createFileRoute("/api/public/share/save")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const userId = await getUserIdFromBearer(request);
        if (!userId) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        let payload: z.infer<typeof Schema>;
        try {
          const raw = await request.json();
          payload = Schema.parse(raw);
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message || "Invalid input" }), {
            status: 400, headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const url = extractUrl(payload);
        if (!url) {
          return new Response(JSON.stringify({ error: "No URL found in shared content" }), {
            status: 400, headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        try {
          const result = await ingestSharedUrl({
            userId,
            url,
            title: payload.title ?? null,
            description: payload.description ?? null,
            image: payload.image ?? null,
            source: payload.source ?? null,
            note: payload.note ?? null,
            context_type: payload.context_type ?? null,
            collection_id: payload.collection_id ?? null,
            share_source: payload.share_source ?? "pwa_share",
          });
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200, headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err?.message || "Save failed" }), {
            status: 500, headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
