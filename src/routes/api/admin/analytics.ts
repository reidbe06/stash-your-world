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

        // 2. Verify admin — service role bypasses RLS
        const { data: callerProfile } = await supabaseAdmin
          .from("profiles")
          .select("is_admin")
          .eq("user_id", userId)
          .maybeSingle();

        if (!callerProfile?.is_admin) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }

        // 3. Time windows
        const now = new Date();
        const startOfToday = new Date(
          now.getFullYear(), now.getMonth(), now.getDate()
        ).toISOString();
        const sevenDaysAgo = new Date(
          now.getTime() - 7 * 24 * 60 * 60 * 1000
        ).toISOString();

        // 4. Fetch ALL items across ALL users (no user_id filter)
        const { data: items, error: itemsError } = await supabaseAdmin
          .from("items")
          .select(
            "id,title,type,category,product_name,product_brand," +
            "affiliate_url,product_url,is_shoppable,affiliate_click_count," +
            "url,user_id,created_at,last_affiliate_click_at"
          );

        if (itemsError) {
          return new Response(JSON.stringify({ error: itemsError.message }), {
            status: 500,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }

        const allItems = items ?? [];

        // 5. User-level stats from profiles
        const [totalUsersRes, newUsersRes] = await Promise.all([
          supabaseAdmin
            .from("profiles")
            .select("*", { count: "exact", head: true }),
          supabaseAdmin
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .gte("created_at", sevenDaysAgo),
        ]);

        const totalUsers    = totalUsersRes.count ?? 0;
        const newUsersWeek  = newUsersRes.count ?? 0;

        // 6. Save stats (derived from items)
        const totalSaves     = allItems.length;
        const savesThisWeek  = allItems.filter(
          (i) => i.created_at && i.created_at >= sevenDaysAgo
        ).length;

        // 7. Active users — unique user_ids with a save or affiliate click in window.
        //    "Active" = at least one save OR Buy Now click during the period.
        const activeToday = new Set(
          allItems
            .filter(
              (i) =>
                (i.created_at && i.created_at >= startOfToday) ||
                ((i as any).last_affiliate_click_at &&
                  (i as any).last_affiliate_click_at >= startOfToday)
            )
            .map((i) => i.user_id)
        ).size;

        const activeThisWeek = new Set(
          allItems
            .filter(
              (i) =>
                (i.created_at && i.created_at >= sevenDaysAgo) ||
                ((i as any).last_affiliate_click_at &&
                  (i as any).last_affiliate_click_at >= sevenDaysAgo)
            )
            .map((i) => i.user_id)
        ).size;

        return new Response(
          JSON.stringify({
            items: allItems,
            stats: {
              totalUsers,
              newUsersThisWeek: newUsersWeek,
              activeUsersToday: activeToday,
              activeUsersThisWeek: activeThisWeek,
              totalSaves,
              savesThisWeek,
            },
          }),
          {
            status: 200,
            headers: { ...CORS, "Content-Type": "application/json" },
          }
        );
      },
    },
  },
});
