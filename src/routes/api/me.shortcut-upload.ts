// Generates the personalised shortcut and stores it in Supabase Storage so
// iOS Shortcuts can fetch it from a clean, stable .shortcut URL — no query
// string, no auth header, no redirect, no HTML.
//
// Flow:
//   1. Client POSTs here with a Bearer token (normal Supabase auth).
//   2. Server generates the plist bytes (pure TS, <5ms).
//   3. Server uploads to Storage: shortcuts/{userId}/STASHd.shortcut
//   4. Returns the public URL + the shortcuts:// deep link.
//
// The public URL looks like:
//   https://<project>.supabase.co/storage/v1/object/public/shortcuts/<userId>/STASHd.shortcut
//
// That URL is then wrapped as:
//   shortcuts://import-shortcut?url=https%3A%2F%2F...<userId>%2FSTASHd.shortcut
import { createFileRoute } from "@tanstack/react-router";
import { getUserIdFromBearer } from "@/lib/share-ingest.server";
import { generateSaveToken } from "@/lib/save-token.server";
import { buildShortcut } from "@/lib/shortcut-builder.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization",
};

const BUCKET = "shortcuts";

const APP_URL =
  process.env.PUBLIC_URL ||
  (process.env.REPLIT_DEPLOYMENT === "1"
    ? "https://stashd.replit.app"
    : `https://${process.env.REPLIT_DEV_DOMAIN || "stashd.replit.app"}`);

async function ensureBucket() {
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 1024 * 1024,
  });
  if (error && !error.message.toLowerCase().includes("already exist")) {
    console.error("[shortcut-upload] bucket create error:", error.message);
  }
}

export const Route = createFileRoute("/api/me/shortcut-upload")({
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

        const saveToken = generateSaveToken(userId);

        const bytes = buildShortcut({
          saveEndpoint: `${APP_URL}/api/public/share/save`,
          tokenValue: saveToken,
          personal: true,
          version: "v2",
        });

        await ensureBucket();

        const storagePath = `${userId}/STASHd.shortcut`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(storagePath, bytes, {
            contentType: "application/octet-stream",
            upsert: true,
          });

        if (uploadError) {
          console.error("[shortcut-upload] upload failed:", uploadError.message);
          return new Response(
            JSON.stringify({ error: `Storage upload failed: ${uploadError.message}` }),
            { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
          );
        }

        const {
          data: { publicUrl },
        } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);

        const shortcutsDeepLink = `shortcuts://import-shortcut?url=${encodeURIComponent(publicUrl)}&name=Save%20to%20STASHd`;

        console.log(`[shortcut-upload] ok userId=${userId} url=${publicUrl}`);

        return new Response(
          JSON.stringify({ url: publicUrl, shortcutsDeepLink }),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS } }
        );
      },
    },
  },
});
