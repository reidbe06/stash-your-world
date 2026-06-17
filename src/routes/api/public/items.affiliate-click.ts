// POST /api/public/items/affiliate-click
// Increments affiliate_click_count and records last_affiliate_click_at.
// Returns { ok: true, url } where url is the affiliate/product/original URL
// to navigate to. Fire-and-forget is fine — the client opens the URL
// immediately and calls this endpoint in the background.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getUserIdFromBearer, supabaseAdmin } from "@/lib/share-ingest.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const Schema = z.object({
  item_id: z.string().uuid(),
});

export const Route = createFileRoute("/api/public/items/affiliate-click")({
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
          // Fetch the item to verify ownership and get the target URL
          const { data: item, error: fetchErr } = await supabaseAdmin
            .from("items")
            .select("id, user_id, affiliate_url, url, affiliate_click_count")
            .eq("id", payload.item_id)
            .eq("user_id", userId)
            .single();

          if (fetchErr || !item) {
            return new Response(JSON.stringify({ error: "Item not found" }), {
              status: 404, headers: { "Content-Type": "application/json", ...CORS },
            });
          }

          // Increment click count (gracefully handle missing column)
          const currentCount = typeof (item as any).affiliate_click_count === "number"
            ? (item as any).affiliate_click_count
            : 0;

          await supabaseAdmin
            .from("items")
            .update({
              affiliate_click_count: currentCount + 1,
              last_affiliate_click_at: new Date().toISOString(),
            } as any)
            .eq("id", payload.item_id);

          const targetUrl = (item as any).affiliate_url || item.url || null;

          return new Response(
            JSON.stringify({ ok: true, url: targetUrl }),
            { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
          );
        } catch (err: any) {
          console.error("[AFFILIATE-CLICK] Error:", err?.message);
          return new Response(JSON.stringify({ ok: false, error: err?.message }), {
            status: 500, headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
