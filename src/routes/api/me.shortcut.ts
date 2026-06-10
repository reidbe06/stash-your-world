// Authenticated endpoint: generates a personalised .shortcut file with the
// user's save token pre-embedded.  On iOS, downloading this file automatically
// opens the Shortcuts app — and because the token is already there, the user
// is never prompted to paste anything.  Zero-copy-paste onboarding.
import { createFileRoute } from "@tanstack/react-router";
import { getUserIdFromBearer } from "@/lib/share-ingest.server";
import { generateSaveToken } from "@/lib/save-token.server";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

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

/** Call Python's plistlib to generate a personalised binary shortcut plist. */
function buildShortcutBytes(saveToken: string): Buffer | null {
  try {
    const scriptPath = join(process.cwd(), "scripts", "generate_shortcut.py");
    const result = spawnSync(
      "python3",
      [scriptPath, APP_URL, "--token", saveToken, "--stdout"],
      { maxBuffer: 64 * 1024, timeout: 10_000 }
    );
    if (result.status !== 0 || !result.stdout?.length) {
      console.error("[me.shortcut] python3 error:", result.stderr?.toString());
      return null;
    }
    return result.stdout as Buffer;
  } catch (err) {
    console.error("[me.shortcut] spawnSync failed:", err);
    return null;
  }
}

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
        const bytes = buildShortcutBytes(saveToken);

        if (!bytes) {
          return new Response(JSON.stringify({ error: "Shortcut generation failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

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
