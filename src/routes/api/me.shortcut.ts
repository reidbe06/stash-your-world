// Authenticated endpoint: generates a personalised .shortcut file with the
// user's save token pre-embedded.  On iOS, downloading this file automatically
// opens the Shortcuts app — and because the token is already there, the user
// is never prompted to paste anything.  Zero-copy-paste onboarding.
import { createFileRoute } from "@tanstack/react-router";
import { getUserIdFromBearer } from "@/lib/share-ingest.server";
import { generateSaveToken } from "@/lib/save-token.server";
import { buildShortcut } from "@/lib/shortcut-builder.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization",
};

const APP_URL =
  process.env.PUBLIC_URL ||
  (process.env.REPLIT_DEPLOYMENT === "1"
    ? "https://stashd.replit.app"
    : `https://${process.env.REPLIT_DEV_DOMAIN || "stashd.replit.app"}`);

export const Route = createFileRoute("/api/me/shortcut")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
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

        return new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": 'attachment; filename="STASHd.shortcut"',
            "Cache-Control": "private, no-store",
            ...CORS,
          },
        });
      },
    },
  },
});
