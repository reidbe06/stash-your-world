// POST /api/public/items/re-extract
// Re-runs the full extraction pipeline (fresh metadata + transcript + AI) on
// an existing save. Preserves user_override, collections, and notes.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getUserIdFromBearer, reExtractItem } from "@/lib/share-ingest.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const Schema = z.object({
  item_id: z.string().uuid(),
});

export const Route = createFileRoute("/api/public/items/re-extract")({
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
          payload = Schema.parse(await request.json());
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message || "Invalid input" }), {
            status: 400, headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        try {
          const result = await reExtractItem({ userId, itemId: payload.item_id });
          return new Response(JSON.stringify({ ok: true, item: result }), {
            status: 200, headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch (err: any) {
          console.error("[RE-EXTRACT] handler error:", err?.message);
          return new Response(JSON.stringify({ error: err?.message || "Re-extraction failed" }), {
            status: 500, headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
