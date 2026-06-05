import { join } from "path";

// Import the compiled Cloudflare-format SSR handler
const { default: ssrHandler } = await import("./dist/server/server.js");

const CLIENT_DIR = join(import.meta.dir, "dist", "client");
const PORT = parseInt(process.env.PORT || "5000");

const MIME = {
  js:          "application/javascript; charset=utf-8",
  mjs:         "application/javascript; charset=utf-8",
  css:         "text/css; charset=utf-8",
  html:        "text/html; charset=utf-8",
  json:        "application/json; charset=utf-8",
  webmanifest: "application/manifest+json; charset=utf-8",
  png:         "image/png",
  jpg:         "image/jpeg",
  jpeg:        "image/jpeg",
  webp:        "image/webp",
  svg:         "image/svg+xml; charset=utf-8",
  ico:         "image/x-icon",
  woff:        "font/woff",
  woff2:       "font/woff2",
  ttf:         "font/ttf",
  otf:         "font/otf",
  zip:         "application/zip",
};

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",

  async fetch(req) {
    const url = new URL(req.url);
    const pathname = decodeURIComponent(url.pathname);
    const file = Bun.file(join(CLIENT_DIR, pathname));

    // Serve static files from dist/client/ (JS, CSS, images, etc.)
    if (await file.exists()) {
      const ext = pathname.split(".").pop()?.toLowerCase() ?? "";
      const isHashedAsset = pathname.startsWith("/assets/");
      return new Response(file, {
        headers: {
          "Content-Type": MIME[ext] ?? "application/octet-stream",
          "Cache-Control": isHashedAsset
            ? "public, max-age=31536000, immutable"
            : "no-cache, no-store, must-revalidate",
        },
      });
    }

    // All other requests go to the SSR handler
    return ssrHandler.fetch(req, {}, {});
  },
});

console.log(`Server running on http://0.0.0.0:${PORT}`);
