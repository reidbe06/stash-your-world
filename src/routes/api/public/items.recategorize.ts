// POST /api/public/items/recategorize
// Accepts a user note for an existing "needs_user_context" item,
// runs AI categorization with that note, and updates the item in place.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getUserIdFromBearer, recategorizeItem } from "@/lib/share-ingest.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const Schema = z.object({
  item_id: z.string().uuid(),
  note: z.string().trim().min(1).max(2000),
});

export const Route = createFileRoute("/api/public/items/recategorize")({
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

        try {
          const result = await recategorizeItem({
            userId,
            itemId: payload.item_id,
            note: payload.note,
          });
          return new Response(JSON.stringify({ ok: true, item: result }), {
            status: 200, headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err?.message || "Recategorize failed" }), {
            status: 500, headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
