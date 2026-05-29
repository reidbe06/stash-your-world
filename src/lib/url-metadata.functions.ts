import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type UrlMetadata = {
  title: string | null;
  description: string | null;
  image: string | null;
  source: string | null;
  type: string | null;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function pickMeta(html: string, names: string[]): string | null {
  for (const name of names) {
    // property="og:title" content="..."  OR  name="..." content="..."
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name)\\s*=\\s*["']${name}["']`, "i"),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) return decodeEntities(m[1].trim());
    }
  }
  return null;
}

function pickTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].trim()).slice(0, 300) : null;
}

function inferType(url: string, ogType: string | null): string {
  const u = url.toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com|tiktok\.com/.test(u)) return "video";
  if (/amazon\.|shopify|etsy|ebay|walmart|target\.com/.test(u)) return "product";
  if (/allrecipes|foodnetwork|seriouseats|recipe|epicurious|bonappetit/.test(u)) return "recipe";
  if (ogType === "video" || ogType?.startsWith("video.")) return "video";
  if (ogType === "product" || ogType?.startsWith("product")) return "product";
  if (ogType === "article") return "article";
  return "link";
}

export const fetchUrlMetadata = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ url: z.string().trim().min(1).max(2000).url() }).parse(input),
  )
  .handler(async ({ data }): Promise<UrlMetadata> => {
    const target = new URL(data.url);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error("Only http(s) URLs are supported");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    let html = "";
    try {
      const res = await fetch(target.toString(), {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; STASHdBot/1.0; +https://stashd.app)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) {
        return {
          title: null,
          description: null,
          image: null,
          source: target.hostname.replace(/^www\./, ""),
          type: "link",
        };
      }
      // Cap body to ~512KB to avoid huge pages
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let received = 0;
        const max = 512 * 1024;
        while (received < max) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          html += decoder.decode(value, { stream: true });
          // Stop early once </head> is seen — metadata lives there
          if (html.includes("</head>")) break;
        }
        try { await reader.cancel(); } catch {}
      } else {
        html = await res.text();
      }
    } catch (err) {
      clearTimeout(timer);
      return {
        title: null,
        description: null,
        image: null,
        source: target.hostname.replace(/^www\./, ""),
        type: "link",
      };
    }
    clearTimeout(timer);

    const ogTitle = pickMeta(html, ["og:title", "twitter:title"]);
    const docTitle = pickTitle(html);
    const description = pickMeta(html, [
      "og:description",
      "twitter:description",
      "description",
    ]);
    let image = pickMeta(html, [
      "og:image:secure_url",
      "og:image",
      "twitter:image",
      "twitter:image:src",
    ]);
    const ogType = pickMeta(html, ["og:type"]);
    const siteName = pickMeta(html, ["og:site_name"]);

    // Resolve relative image URLs
    if (image) {
      try { image = new URL(image, target).toString(); } catch { image = null; }
    }

    const source = siteName || target.hostname.replace(/^www\./, "");

    return {
      title: ogTitle || docTitle,
      description: description ? description.slice(0, 1000) : null,
      image,
      source,
      type: inferType(target.toString(), ogType),
    };
  });
