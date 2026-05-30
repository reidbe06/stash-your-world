/**
 * transcript.server.ts
 *
 * Extracts caption / transcript text from video platform URLs.
 * Plugs into share-ingest.server.ts at the transcript placeholder.
 *
 * Priority per platform
 *   YouTube / Shorts  → timedtext API (free, fast) → page caption track extraction
 *   TikTok            → page scrape (__NEXT_DATA__ / SIGI_STATE) → Firecrawl fallback
 *   Instagram Reel    → Firecrawl (JS-rendered, most reliable) → og:description fallback
 *   Other video       → null (no transcript source available)
 */

const MAX_TRANSCRIPT_CHARS = 7500; // stays inside the 8000-char embedding limit
const FETCH_TIMEOUT_MS = 12_000;

export type TranscriptResult = {
  text: string;
  method: string;
  isPartial: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

async function readPartialHtml(res: Response, maxBytes = 1_500_000): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const decoder = new TextDecoder();
  let html = "";
  let received = 0;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    html += decoder.decode(value, { stream: true });
  }
  try { await reader.cancel(); } catch {}
  return html;
}

function trunc(s: string): { text: string; isPartial: boolean } {
  const truncated = s.slice(0, MAX_TRANSCRIPT_CHARS);
  return { text: truncated, isPartial: truncated.length < s.length };
}

// ─── YouTube ──────────────────────────────────────────────────────────────────

function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const v = u.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{6,20}$/.test(v)) return v;
    const shorts = u.pathname.match(/\/shorts\/([A-Za-z0-9_-]{6,20})/);
    if (shorts) return shorts[1];
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("?")[0].split("/")[0];
      if (/^[A-Za-z0-9_-]{6,20}$/.test(id)) return id;
    }
    return null;
  } catch { return null; }
}

function parseJson3Captions(raw: string): string | null {
  try {
    const json = JSON.parse(raw);
    const parts: string[] = [];
    for (const ev of json.events ?? []) {
      if (!ev.segs) continue;
      const line = ev.segs
        .map((s: any) => (s.utf8 ?? "").replace(/\n/g, " "))
        .join("")
        .trim();
      if (line) parts.push(line);
    }
    const result = parts.join(" ").replace(/\s+/g, " ").trim();
    return result.length > 20 ? result : null;
  } catch { return null; }
}

function parseXmlCaptions(raw: string): string | null {
  try {
    const decoded = decodeHtmlEntities(raw);
    const nodes = decoded.match(/<text[^>]*>([\s\S]*?)<\/text>/g) ?? [];
    const parts = nodes
      .map(n => n.replace(/<[^>]+>/g, "").replace(/\n/g, " ").trim())
      .filter(Boolean);
    const result = parts.join(" ").replace(/\s+/g, " ").trim();
    return result.length > 20 ? result : null;
  } catch { return null; }
}

async function tryYouTubeTimedtext(videoId: string, lang: string): Promise<string | null> {
  try {
    const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim() || text.trim() === "{}" || text.trim() === "null") return null;
    return parseJson3Captions(text) ?? parseXmlCaptions(text);
  } catch { return null; }
}

async function tryYouTubePageCaptions(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const html = await readPartialHtml(res);

    // ytInitialPlayerResponse contains captionTracks with baseUrl
    const captionMatch = html.match(/"captionTracks":\s*\[\s*\{"baseUrl":"([^"]+)"/);
    if (!captionMatch?.[1]) return null;

    const captionUrl = captionMatch[1]
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"');

    // Prefer json3, fall back to plain XML
    for (const suffix of ["&fmt=json3", ""]) {
      try {
        const captRes = await fetch(captionUrl + suffix, {
          signal: AbortSignal.timeout(10_000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
        });
        if (!captRes.ok) continue;
        const raw = await captRes.text();
        const parsed = parseJson3Captions(raw) ?? parseXmlCaptions(raw);
        if (parsed) return parsed;
      } catch {}
    }
    return null;
  } catch { return null; }
}

async function fetchYouTubeTranscript(url: string): Promise<TranscriptResult | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  // 1. Try timedtext API with common English language codes
  for (const lang of ["en", "en-US", "en-GB", "en-CA", "en-AU"]) {
    const text = await tryYouTubeTimedtext(videoId, lang);
    if (text) {
      const { text: t, isPartial } = trunc(text);
      return { text: t, method: "youtube_timedtext", isPartial };
    }
  }

  // 2. Parse caption track URL from the watch page
  const pageText = await tryYouTubePageCaptions(videoId);
  if (pageText) {
    const { text: t, isPartial } = trunc(pageText);
    return { text: t, method: "youtube_page_caption", isPartial };
  }

  return null;
}

// ─── TikTok ───────────────────────────────────────────────────────────────────

/** Recursively find a key in a nested object up to maxDepth levels. */
function deepFind(obj: unknown, key: string, maxDepth: number): unknown {
  if (maxDepth <= 0 || obj === null || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  if (key in o) return o[key];
  for (const val of Object.values(o)) {
    const found = deepFind(val, key, maxDepth - 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function extractTikTokDescFromData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  // Common structural paths across TikTok page versions
  const paths: string[][] = [
    ["props", "pageProps", "itemInfo", "itemStruct", "desc"],
    ["props", "pageProps", "videoData", "itemInfos", "text"],
    ["__DEFAULT_SCOPE__", "webapp.video-detail", "itemInfo", "itemStruct", "desc"],
  ];
  for (const path of paths) {
    let node: unknown = data;
    for (const key of path) {
      if (!node || typeof node !== "object") { node = undefined; break; }
      node = (node as Record<string, unknown>)[key];
    }
    if (typeof node === "string" && node.trim().length > 5) return node.trim();
  }
  // Broad deep search for "desc" field (catches version differences)
  const desc = deepFind(data, "desc", 8);
  if (typeof desc === "string" && desc.trim().length > 5) return desc.trim();
  return null;
}

async function fetchTikTokPageCaption(url: string): Promise<TranscriptResult | null> {
  const userAgents = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  ];

  for (const ua of userAgents) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });
      if (!res.ok) continue;
      const html = await readPartialHtml(res);

      // Path 1: __NEXT_DATA__ (used by TikTok's Next.js frontend)
      const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataMatch?.[1]) {
        try {
          const desc = extractTikTokDescFromData(JSON.parse(nextDataMatch[1]));
          if (desc) {
            const { text: t, isPartial } = trunc(desc);
            return { text: t, method: "tiktok_next_data", isPartial };
          }
        } catch {}
      }

      // Path 2: __UNIVERSAL_DATA_FOR_REHYDRATION__ (newer TikTok web version)
      const universalMatch = html.match(/window\["__UNIVERSAL_DATA_FOR_REHYDRATION__"\]\s*=\s*(\{[\s\S]*?\})\s*;/);
      if (universalMatch?.[1]) {
        try {
          const desc = extractTikTokDescFromData(JSON.parse(universalMatch[1]));
          if (desc) {
            const { text: t, isPartial } = trunc(desc);
            return { text: t, method: "tiktok_universal_data", isPartial };
          }
        } catch {}
      }

      // Path 3: SIGI_STATE (legacy TikTok SPA)
      const sigiMatch = html.match(/window\.__SIGI_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/);
      if (sigiMatch?.[1]) {
        try {
          const desc = extractTikTokDescFromData(JSON.parse(sigiMatch[1]));
          if (desc) {
            const { text: t, isPartial } = trunc(desc);
            return { text: t, method: "tiktok_sigi_state", isPartial };
          }
        } catch {}
      }

      // Path 4: og:description meta tag (often partially present)
      const ogDescPatterns = [
        html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i),
        html.match(/content="([^"]+)"[^>]+property="og:description"/i),
        html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i),
      ];
      for (const m of ogDescPatterns) {
        if (!m?.[1]) continue;
        const text = decodeHtmlEntities(m[1]).trim();
        if (text.length > 20 && !/^(tiktok|watch.*tiktok|log in)/i.test(text)) {
          const { text: t, isPartial } = trunc(text);
          return { text: t, method: "tiktok_og_desc", isPartial };
        }
      }
    } catch {}
  }
  return null;
}

// ─── Firecrawl Caption Extraction (Instagram + TikTok fallback) ───────────────

const FIRECRAWL_PROMPTS: Record<string, string> = {
  instagram:
    "Extract the complete Instagram post caption text including all hashtags (e.g. #recipe #fashion), user mentions (@username), product names, brand names, and location tags. " +
    "The 'caption' field must contain the full verbatim caption. " +
    "If this is a recipe: list ingredients and cooking steps. " +
    "If this is a product or fashion post: list the specific products, brands, and prices if shown. " +
    "If this is travel: extract the destination and activities. " +
    "If this is a fitness post: list the exercises and workout details. " +
    "If this is home decor: list items, brands, and style description. " +
    "Return null for any field you cannot find.",
  tiktok:
    "Extract the complete TikTok video caption and all hashtags. " +
    "Identify the content type and extract structured details: " +
    "recipe (ingredients list + step-by-step instructions), " +
    "product review or haul (specific product names, brands, prices), " +
    "fashion content (clothing items, brands, styling tips), " +
    "travel vlog (destination, places visited, activities), " +
    "fitness or workout (exercises, reps, sets, duration), " +
    "home decor (furniture/decor items, brands, room type), " +
    "tutorial or how-to (key steps and tools/materials needed). " +
    "The 'caption' field must contain the verbatim caption with all hashtags. " +
    "Return null for any fields not clearly present in the content.",
};

async function fetchCaptionViaFirecrawl(
  url: string,
  platform: "instagram" | "tiktok",
): Promise<TranscriptResult | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22_000);

  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: [
          {
            type: "json",
            prompt: FIRECRAWL_PROMPTS[platform],
          },
          "summary",
        ],
        onlyMainContent: true,
        waitFor: 2500,
        location: { country: "US", languages: ["en"] },
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const raw: any = await res.json();
    const doc = raw.data ?? raw;
    const extracted: Record<string, any> = doc.json ?? {};
    const summary: string = doc.summary ?? "";

    const parts: string[] = [];

    // Caption / description (primary text)
    if (typeof extracted.caption === "string" && extracted.caption.trim().length > 10) {
      parts.push(`Caption: ${extracted.caption.trim()}`);
    } else if (typeof extracted.description === "string" && extracted.description.trim().length > 10) {
      parts.push(`Description: ${extracted.description.trim()}`);
    }

    // Topic / content type hint
    if (typeof extracted.topic === "string" && extracted.topic.trim()) {
      parts.push(`Topic: ${extracted.topic.trim()}`);
    }
    if (typeof extracted.content_type === "string" && extracted.content_type.trim()) {
      parts.push(`Content type: ${extracted.content_type.trim()}`);
    }

    // Recipe
    if (Array.isArray(extracted.ingredients) && extracted.ingredients.length > 0) {
      parts.push(`Ingredients: ${extracted.ingredients.join(", ")}`);
    }
    if (Array.isArray(extracted.steps) && extracted.steps.length > 0) {
      parts.push(`Steps: ${extracted.steps.slice(0, 15).join(" | ")}`);
    }
    if (Array.isArray(extracted.recipe_ingredients) && extracted.recipe_ingredients.length > 0) {
      parts.push(`Ingredients: ${extracted.recipe_ingredients.join(", ")}`);
    }
    if (Array.isArray(extracted.recipe_steps) && extracted.recipe_steps.length > 0) {
      parts.push(`Steps: ${extracted.recipe_steps.slice(0, 15).join(" | ")}`);
    }

    // Products / fashion
    if (Array.isArray(extracted.products) && extracted.products.length > 0) {
      parts.push(`Products: ${extracted.products.join(", ")}`);
    }
    if (Array.isArray(extracted.clothing_items) && extracted.clothing_items.length > 0) {
      parts.push(`Clothing: ${extracted.clothing_items.join(", ")}`);
    }
    if (typeof extracted.brands === "string") parts.push(`Brands: ${extracted.brands}`);
    if (Array.isArray(extracted.brands)) parts.push(`Brands: ${extracted.brands.join(", ")}`);

    // Travel
    if (typeof extracted.destination === "string" && extracted.destination.trim()) {
      parts.push(`Destination: ${extracted.destination.trim()}`);
    }
    if (Array.isArray(extracted.activities) && extracted.activities.length > 0) {
      parts.push(`Activities: ${extracted.activities.join(", ")}`);
    }

    // Fitness
    if (Array.isArray(extracted.exercises) && extracted.exercises.length > 0) {
      parts.push(`Exercises: ${extracted.exercises.join(", ")}`);
    }

    // Home decor
    if (Array.isArray(extracted.decor_items) && extracted.decor_items.length > 0) {
      parts.push(`Decor items: ${extracted.decor_items.join(", ")}`);
    }

    // Tutorial / how-to
    if (Array.isArray(extracted.key_steps) && extracted.key_steps.length > 0) {
      parts.push(`Key steps: ${extracted.key_steps.slice(0, 10).join(" | ")}`);
    }

    // Fall back to Firecrawl's own summary if extraction returned nothing
    if (parts.length === 0 && summary && summary.trim().length > 20) {
      const { text: t, isPartial } = trunc(summary.trim());
      return { text: t, method: `${platform}_firecrawl_summary`, isPartial };
    }

    if (parts.length === 0) return null;

    const text = parts.join("\n");
    const { text: t, isPartial } = trunc(text);
    return { text: t, method: `${platform}_firecrawl`, isPartial };
  } catch (err) {
    console.warn(`[transcript] Firecrawl ${platform} error:`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Instagram ────────────────────────────────────────────────────────────────

async function fetchInstagramPageCaption(url: string): Promise<TranscriptResult | null> {
  // Instagram aggressively blocks bots; facebookexternalhit sometimes gets og:description
  for (const ua of [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  ]) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });
      if (!res.ok) continue;
      const html = await res.text();

      // og:description on Instagram often contains the caption (truncated to ~100 chars)
      const patterns = [
        html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i),
        html.match(/content="([^"]+)"[^>]+property="og:description"/i),
        html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i),
      ];
      for (const m of patterns) {
        if (!m?.[1]) continue;
        const text = decodeHtmlEntities(m[1]).trim();
        // Skip generic Instagram responses
        if (
          text.length > 20 &&
          !/^(instagram|log in|sign in|see.*instagram|create.*account|explore|reel|video)/i.test(text)
        ) {
          const { text: t, isPartial } = trunc(text);
          return { text: t, method: "instagram_og_desc", isPartial: isPartial || text.length < 150 };
        }
      }
    } catch {}
  }
  return null;
}

async function fetchInstagramCaption(url: string): Promise<TranscriptResult | null> {
  // Firecrawl is the only reliable path for Instagram (handles JS rendering + login walls)
  const firecrawlResult = await fetchCaptionViaFirecrawl(url, "instagram");
  if (firecrawlResult) return firecrawlResult;

  // Direct scrape fallback (usually truncated but better than nothing)
  return fetchInstagramPageCaption(url);
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Attempts to extract caption/transcript text from a video URL.
 * Returns null if no useful text can be found.
 *
 * @param url      - The full video URL
 * @param platform - Platform identifier string (from detectPlatform in share-ingest.server.ts)
 */
export async function fetchTranscript(
  url: string,
  platform: string,
): Promise<TranscriptResult | null> {
  try {
    switch (platform) {
      case "youtube":
      case "youtube_short":
        return await fetchYouTubeTranscript(url);
      case "tiktok":
        return await fetchTikTokPageCaption(url)
          ?? await fetchCaptionViaFirecrawl(url, "tiktok");
      case "instagram_reel":
      case "instagram":
        return await fetchInstagramCaption(url);
      default:
        return null;
    }
  } catch (err) {
    console.warn(`[transcript] Unhandled error for ${platform}:`, err);
    return null;
  }
}
