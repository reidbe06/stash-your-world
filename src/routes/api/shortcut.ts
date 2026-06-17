// Public endpoint — no Bearer auth required.
// The save token in the query param IS the credential.
// Used by the shortcuts://import-shortcut?url= scheme so iOS Shortcuts
// can fetch the personalised file directly (it cannot send auth headers).
import { createFileRoute } from "@tanstack/react-router";
import { validateSaveToken } from "@/lib/save-token.server";
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

function buildShortcutBytes(saveToken: string): Buffer | null {
  try {
    const scriptPath = join(process.cwd(), "scripts", "generate_shortcut.py");
    const result = spawnSync(
      "python3",
      [scriptPath, APP_URL, "--token", saveToken, "--stdout"],
      { maxBuffer: 64 * 1024, timeout: 10_000 }
    );
    if (result.status !== 0 || !result.stdout?.length) {
      console.error("[shortcut] python3 error:", result.stderr?.toString());
      return null;
    }
    return result.stdout as Buffer;
  } catch (err) {
    console.error("[shortcut] spawnSync failed:", err);
    return null;
  }
}

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

        const bytes = buildShortcutBytes(token);
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
