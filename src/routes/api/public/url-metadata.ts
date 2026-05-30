// Public URL metadata fetch endpoint.
// Called by the /save and /share pages to auto-fill title, description, and thumbnail.
// Uses Bearer auth (same as share-save) so the server can validate the user is signed in.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { fetchMetadata } from "@/lib/url-metadata.server";
import { getUserIdFromBearer } from "@/lib/share-ingest.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const Schema = z.object({
  url: z.string().trim().min(1).max(2000).url(),
});

export const Route = createFileRoute("/api/public/url-metadata")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const userId = await getUserIdFromBearer(request);
        if (!userId) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        let payload: z.infer<typeof Schema>;
        try {
          const raw = await request.json();
          payload = Schema.parse(raw);
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message || "Invalid URL" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        try {
          const meta = await fetchMetadata(payload.url);
          return new Response(JSON.stringify({ ok: true, ...meta }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message || "Fetch failed" }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
