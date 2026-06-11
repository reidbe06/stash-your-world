import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { backfillVideoTitles } from "@/lib/share-ingest.server";

export const runBackfillTitles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    return backfillVideoTitles(userId);
  });
