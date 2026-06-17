// GET /api/admin/analytics
// Returns platform-wide affiliate commerce metrics across ALL users.
// Requires a valid Bearer token from an is_admin = true profile.
import { createFileRoute } from "@tanstack/react-router";
import { getUserIdFromBearer } from "@/lib/share-ingest.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/admin/analytics")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        // 1. Authenticate
        const userId = await getUserIdFromBearer(request);
        if (!userId) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }

        // 2. Verify admin — use service role to bypass RLS
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("is_admin")
          .eq("user_id", userId)
          .maybeSingle();

        if (!profile?.is_admin) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }

        // 3. Fetch ALL items across ALL users — service role bypasses RLS
        const { data, error } = await supabaseAdmin
          .from("items")
          .select("id,title,type,category,product_name,product_brand,affiliate_url,product_url,is_shoppable,affiliate_click_count,url");

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ items: data ?? [] }), {
          status: 200,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      },
    },
  },
});
