// Public endpoint — no Bearer auth required.
// The save token in the query param IS the credential.
// Used by the shortcuts://import-shortcut?url= scheme so iOS Shortcuts
// can fetch the personalised file directly (it cannot send auth headers).
import { createFileRoute } from "@tanstack/react-router";
import { validateSaveToken } from "@/lib/save-token.server";
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

export const Route = createFileRoute("/api/shortcut")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";

        const userId = validateSaveToken(token);
        if (!userId) {
          return new Response(JSON.stringify({ error: "Invalid or missing token" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const bytes = buildShortcut({
          saveEndpoint: `${APP_URL}/api/public/share/save`,
          tokenValue: token,
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
