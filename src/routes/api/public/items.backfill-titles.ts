// POST /api/public/items/backfill-titles
// Finds all of the authenticated user's saves with generic platform titles
// ("Instagram Reel", "TikTok Video", etc.) and regenerates descriptive titles
// from stored caption / transcript / category metadata via GPT-4o-mini.
import { createFileRoute } from "@tanstack/react-router";
import { getUserIdFromBearer, backfillVideoTitles } from "@/lib/share-ingest.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export const Route = createFileRoute("/api/public/items/backfill-titles")({
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

        try {
          const result = await backfillVideoTitles(userId);
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err?.message || "Backfill failed" }),
            { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }
      },
    },
  },
});
