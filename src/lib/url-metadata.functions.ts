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
    const timer = setTimeout(() => controller.abort(), 10000);
    const hostSource = target.hostname.replace(/^www\./, "");

    // Known unfurler UA — Instagram, TikTok, Pinterest, X/Twitter, Facebook,
    // LinkedIn, Reddit, YouTube etc. only serve full OG/Twitter meta tags to
    // recognized link-preview bots. A generic browser or "STASHdBot" UA gets
    // an empty SPA shell with no metadata. We try the unfurler UA first, then
    // a real browser UA as a fallback for sites that block bots.
    // Try multiple UAs. Some retailers (Walmart, Target) block facebookexternalhit
    // and serve a bot-challenge page ("Robot or human?"); they typically allow
    // Googlebot/Bingbot. Instagram/TikTok/Pinterest only serve OG tags to known
    // unfurlers. We try unfurler UAs first, then search bots, then real browser.
    const UAS = [
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    ];

    const isBlockedPage = (body: string): boolean => {
      const t = pickTitle(body)?.toLowerCase() ?? "";
      if (/robot or human|are you a robot|access denied|just a moment|attention required|pardon our interruption|captcha|cloudflare/i.test(t)) return true;
      if (/<title[^>]*>\s*<\/title>/i.test(body) && body.length < 4000) return true;
      return false;
    };

    let html = "";
    let htmlScore = 0; // higher = better
    for (const ua of UAS) {
      try {
        const res = await fetch(target.toString(), {
          signal: controller.signal,
          redirect: "follow",
          headers: {
            "User-Agent": ua,
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
        if (!res.ok) continue;
        const reader = res.body?.getReader();
        let body = "";
        if (reader) {
          const decoder = new TextDecoder();
          let received = 0;
          const max = 1024 * 1024; // 1 MB
          while (received < max) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            body += decoder.decode(value, { stream: true });
            if (body.includes("</head>")) break;
          }
          try { await reader.cancel(); } catch {}
        } else {
          body = await res.text();
        }
        if (!body) continue;
        if (isBlockedPage(body)) continue; // try next UA
        const hasOg = /<meta[^>]+(og:|twitter:)/i.test(body);
        const score = hasOg ? 2 : 1;
        if (score > htmlScore) {
          html = body;
          htmlScore = score;
          if (hasOg) break;
        }
      } catch { /* try next UA */ }
    }

    // oEmbed fallback for known apps that don't serve usable HTML metadata.
    let oembed: { title: string | null; image: string | null; source: string | null } | null = null;
    const h = target.hostname;
    let oembedEndpoint: string | null = null;
    if (/(^|\.)youtube\.com$/.test(h) || h === "youtu.be") {
      oembedEndpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(target.toString())}`;
    } else if (/(^|\.)vimeo\.com$/.test(h)) {
      oembedEndpoint = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(target.toString())}`;
    } else if (/(^|\.)tiktok\.com$/.test(h)) {
      oembedEndpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(target.toString())}`;
    }
    if (oembedEndpoint) {
      try {
        const r = await fetch(oembedEndpoint, { signal: controller.signal, headers: { "User-Agent": UAS[1] } });
        if (r.ok) {
          const j: any = await r.json();
          oembed = {
            title: j.title || null,
            image: j.thumbnail_url || null,
            source: j.provider_name || null,
          };
        }
      } catch { /* ignore */ }
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
      "og:image:url",
      "og:image",
      "twitter:image",
      "twitter:image:src",
      "thumbnail",
    ]);
    const ogType = pickMeta(html, ["og:type"]);
    const siteName = pickMeta(html, ["og:site_name", "application-name"]);

    if (image) {
      try { image = new URL(image, target).toString(); } catch { image = null; }
    }

    return {
      title: ogTitle || docTitle || oembed?.title || null,
      description: description ? description.slice(0, 1000) : null,
      image: image || oembed?.image || null,
      source: siteName || oembed?.source || hostSource,
      type: inferType(target.toString(), ogType),
    };
  });
