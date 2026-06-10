// Server-only: shared "ingest a URL → AI categorize → save → embed" pipeline
// used by the Chrome extension, PWA share target, and any future native
// mobile share handlers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bestTitleFromUrl, fetchMetadata, isMeaningfulMetadataValue, type UrlMetadata } from "./url-metadata.server";
import { fetchTranscript } from "./transcript.server";
import { fetchTikTokApify, fetchInstagramApify } from "./apify.server";
import { CATEGORIES, CONTENT_TYPES, SUBCATEGORY_TAXONOMY } from "./taxonomy";
import {
  contentTypeFromCategory, platformToMediaFormat, detectPlatform, isVideoPlatform,
  type SourcePlatform,
} from "./content-type-utils";
export type { SourcePlatform } from "./content-type-utils";

export const SHARE_SOURCES = [
  "web",
  "extension",
  "pwa_share",
  "ios_shortcut",
  "mobile_app",
] as const;
export type ShareSource = (typeof SHARE_SOURCES)[number];

// ─── Thumbnail helpers ────────────────────────────────────────────────────────

const THUMBNAIL_BUCKET = "thumbnails";

/**
 * Matches TikTok thumbnail URLs that contain a burned-in play overlay:
 *   - tiktok.com/api/img  — ephemeral api/img placeholder
 *   - photomode-video-share-card — TikTok's 1200×630 social "share card" with
 *     a play button, creator handle, and stats baked into the JPEG
 */
const DIRTY_TT_RE = /tiktok\.com\/api\/img|photomode-video-share-card/i;

/**
 * Minimum byte size for a usable thumbnail.
 * Actual content thumbnails are always well above this; anything below is an
 * icon, a placeholder, or a broken asset (e.g. Instagram's 32×32 rsrc.php icon).
 */
const MIN_THUMB_BYTES = 10_000;

/**
 * Matches Instagram's static-asset CDN used for site chrome (icons, logos,
 * placeholder images). These are NOT content thumbnails.
 * e.g. https://static.cdninstagram.com/rsrc.php/yr/r/rzWiSjZRxk5.webp
 */
const INSTAGRAM_STATIC_RE = /cdninstagram\.com\/rsrc\.php/i;

/**
 * Fetches the clean static poster frame from Instagram's oEmbed endpoint.
 * Returns thumbnail_url on success, null on any failure.
 * Instagram oEmbed is unauthenticated for public content and returns the raw
 * cover image without a play-button overlay.
 */
async function fetchInstagramOembedThumbnail(url: string): Promise<string | null> {
  try {
    const endpoint = `https://www.instagram.com/oembed?url=${encodeURIComponent(url)}&maxwidth=640`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6_000);
    const res = await fetch(endpoint, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      },
    });
    clearTimeout(t);
    if (!res.ok) {
      console.log(`[IG-OEMBED] HTTP ${res.status} for ${url.slice(0, 80)}`);
      return null;
    }
    const json: Record<string, unknown> = await res.json();
    const thumb = typeof json.thumbnail_url === "string" ? json.thumbnail_url.trim() : null;
    console.log(`[IG-OEMBED] thumbnail_url=${thumb ? thumb.slice(0, 80) : "null"}`);
    return thumb || null;
  } catch (err) {
    console.log(`[IG-OEMBED] failed: ${err}`);
    return null;
  }
}

/**
 * Downloads a hotlink-protected CDN image server-side and uploads it to
 * Supabase Storage so the browser can load it without CORS / hotlink errors.
 *
 * Instagram scontent-*.cdninstagram.com URLs return 200 server-side but 403
 * in the browser (hotlink / Referer check). Caching fixes that permanently.
 *
 * Returns the public storage URL, or the original rawUrl if download fails.
 */
async function cacheThumbnailToStorage(
  rawUrl: string,
  platform: string,
  seed: string,
): Promise<string | null> {
  try {
    const refererMap: Record<string, string> = {
      instagram:       "https://www.instagram.com/",
      instagram_reel:  "https://www.instagram.com/",
      tiktok:          "https://www.tiktok.com/",
    };
    const referer = refererMap[platform] ?? "https://www.google.com/";

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(rawUrl, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        "Referer": referer,
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[THUMB-CACHE] download ${res.status} for ${rawUrl.slice(0, 80)}…`);
      return rawUrl;
    }

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.includes("webp") ? "webp" : contentType.includes("png") ? "png" : "jpg";

    // Stable filename: platform + hash of the seed URL
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
    const storagePath = `${platform}/${Math.abs(hash).toString(36)}.${ext}`;

    const arrayBuffer = await res.arrayBuffer();

    // Reject tiny images — icons/placeholders are always < 10 KB; real thumbs are not
    if (arrayBuffer.byteLength < MIN_THUMB_BYTES) {
      console.warn(`[THUMB-CACHE] rejected tiny image (${arrayBuffer.byteLength}B) for ${rawUrl.slice(0, 60)}`);
      return null;
    }

    const { error } = await supabaseAdmin.storage
      .from(THUMBNAIL_BUCKET)
      .upload(storagePath, arrayBuffer, {
        contentType,
        upsert: true,
        cacheControl: "31536000",
      });

    if (error) {
      console.warn(`[THUMB-CACHE] storage upload failed: ${error.message}`);
      return rawUrl;
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from(THUMBNAIL_BUCKET)
      .getPublicUrl(storagePath);

    console.log(`[THUMB-CACHE] ✓ ${platform} → ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    console.warn(`[THUMB-CACHE] error: ${err}`);
    return rawUrl;
  }
}

function logThumbnail(
  platform: string,
  url: string,
  method: string,
  attempt: number,
  success: boolean,
  thumbnailUrl: string | null,
) {
  console.log(
    `[THUMBNAIL]\n` +
    `  platform: ${platform}\n` +
    `  url: ${url}\n` +
    `  method: ${method}\n` +
    `  attempt: ${attempt}\n` +
    `  success/fail: ${success ? "success" : "fail"}\n` +
    `  thumbnailUrl: ${thumbnailUrl ?? "null"}`,
  );
}

async function refreshThumbnailBackground(
  itemId: string,
  url: string,
  platform: string,
): Promise<void> {
  const log = (msg: string) =>
    console.log(`[THUMBNAIL-REFRESH] item=${itemId} platform=${platform} ${msg}`);
  log(`starting for url=${url}`);
  let thumbnail: string | null = null;

  if (platform === "tiktok") {
    // Attempt 1: Apify coverUrl — raw video cover, no burned-in play overlay
    try {
      const result = await fetchTikTokApify(url);
      if (result?.thumbnail && !DIRTY_TT_RE.test(result.thumbnail)) {
        thumbnail = result.thumbnail;
        logThumbnail(platform, url, "apify_cover", 1, true, thumbnail);
      }
    } catch (err) {
      log(`Apify failed: ${err}`);
    }
    // Attempt 2: TikTok oEmbed — fallback only; reject photomode-video-share-card URLs
    if (!thumbnail) {
      for (let i = 1; i <= 3 && !thumbnail; i++) {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 6000);
          const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
          const res = await fetch(endpoint, {
            signal: ctrl.signal,
            headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
          });
          clearTimeout(t);
          if (res.ok) {
            const json: Record<string, unknown> = await res.json();
            const candidate = typeof json.thumbnail_url === "string" ? json.thumbnail_url : null;
            if (candidate && !DIRTY_TT_RE.test(candidate)) {
              thumbnail = candidate;
              logThumbnail(platform, url, "oembed", i, true, thumbnail);
            } else if (candidate) {
              log(`oEmbed attempt ${i}: rejected dirty URL (share-card/api-img)`);
            }
          }
        } catch (err) {
          log(`oEmbed attempt ${i} failed: ${err}`);
        }
        if (!thumbnail && i < 3) await new Promise(r => setTimeout(r, 400 * i));
      }
    }
  }

  if (platform === "instagram" || platform === "instagram_reel") {
    // Attempt 1: Instagram oEmbed — returns clean static poster frame without play overlay
    try {
      const oembedThumb = await fetchInstagramOembedThumbnail(url);
      if (oembedThumb) {
        thumbnail = oembedThumb;
        logThumbnail(platform, url, "ig_oembed", 1, true, thumbnail);
      }
    } catch (err) {
      log(`Instagram oEmbed failed: ${err}`);
    }
    // Attempt 2: Apify displayUrl — fallback if oEmbed fails
    if (!thumbnail) {
      try {
        const result = await fetchInstagramApify(url);
        if (result?.thumbnail) {
          thumbnail = result.thumbnail;
          logThumbnail(platform, url, "apify_display", 1, true, thumbnail);
        }
      } catch (err) {
        log(`Apify failed: ${err}`);
      }
    }
  }

  if (thumbnail) {
    // Cache the CDN URL to storage so it loads in browsers without hotlink errors
    const cachedUrl = await cacheThumbnailToStorage(thumbnail, platform, url);
    if (cachedUrl) {
      const { error } = await supabaseAdmin
        .from("items")
        .update({ image_url: cachedUrl })
        .eq("id", itemId);
      if (error) {
        log(`DB update failed: ${error.message}`);
      } else {
        log(`DB updated with cached thumbnail: ${cachedUrl}`);
      }
    } else {
      log(`thumbnail rejected as too small — keeping existing image_url unchanged`);
    }
  } else {
    log(`no thumbnail found — all methods exhausted`);
    logThumbnail(platform, url, "background_refresh", 3, false, null);
  }
}

// ─── Product link extraction from caption / transcript text ──────────────────

const PRODUCT_DOMAIN_RE = /\b(amazon\.|amzn\.to|etsy\.com|target\.com|nordstrom\.com|sephora\.com|ulta\.com|walmart\.com|bestbuy\.com|wayfair\.com|anthropologie\.com|freepeople\.com|revolve\.com|asos\.com|shein\.com|zara\.com|macys\.com|bloomingdales\.com|farfetch\.com|net-a-porter\.com|ltk\.app|liketoknow\.it|shopltk\.com|shop\.app|shopify\.com)\b/i;

function extractProductLinksFromText(text: string): Array<{ url: string; retailer: string | null }> {
  const urlRe = /https?:\/\/[^\s\u0000-\u001f<>"']+/g;
  const found = text.match(urlRe) ?? [];
  const results: Array<{ url: string; retailer: string | null }> = [];
  for (const url of found) {
    if (!PRODUCT_DOMAIN_RE.test(url)) continue;
    let retailer: string | null = null;
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      const parts = hostname.split(".");
      const name = parts.length > 1 ? parts[parts.length - 2] : hostname;
      retailer = name.charAt(0).toUpperCase() + name.slice(1);
    } catch {}
    results.push({ url, retailer });
  }
  return results;
}

const SUBCATEGORY_HINT = Object.entries(SUBCATEGORY_TAXONOMY)
  .map(([type, subs]) => `  ${type}: ${subs.join(", ")}`)
  .join("\n");

export type ProcessingStatus =
  | "pending"
  | "metadata_found"
  | "transcript_found"
  | "ai_processed"
  | "needs_user_context"
  | "failed";

// Best-effort creator handle extraction from URL path (e.g. /@username/video/123)
function creatorFromUrl(rawUrl: string, platform: SourcePlatform): string | null {
  try {
    const u = new URL(rawUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    if (platform === "tiktok" || platform === "youtube_short" || platform === "youtube") {
      const handle = parts.find((p) => p.startsWith("@"));
      if (handle) return handle;
    }
    if (platform === "instagram" || platform === "instagram_reel") {
      const first = parts[0];
      if (first && !["reel", "reels", "p", "tv", "stories", "explore"].includes(first)) return `@${first}`;
    }
    return null;
  } catch {
    return null;
  }
}

// Strip Instagram og:description engagement header, returning only the caption text.
// "138K likes, 12K comments - @handle on Date: "caption text"" → "caption text"
function extractCaptionText(raw: string): string {
  if (/^\d/.test(raw.trimStart())) {
    const m = raw.match(/[^:]+:\s*["""']([\s\S]+)/);
    if (m) {
      const inner = m[1].replace(/["""']$/, "").trim();
      if (inner.length > 20) return inner;
    }
  }
  return raw;
}

async function aiCategorize(input: {
  url: string; title: string; description: string; source: string;
  platform: SourcePlatform;
  creator?: string | null;
  caption?: string | null;
  transcript?: string | null;
  hashtags?: string[];
  notes?: string; contextType?: string;
  existingCollections: string[];
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const content = [
    input.url && `URL: ${input.url}`,
    input.source && `Source: ${input.source}`,
    input.platform && `Platform: ${input.platform}`,
    input.creator && `Creator: ${input.creator}`,
    input.title && `Title: ${input.title}`,
    input.caption && `Caption: ${input.caption}`,
    input.description && `Description: ${input.description}`,
    input.transcript && `Transcript: ${input.transcript.slice(0, 6000)}`,
    input.hashtags?.length && `Hashtags: ${input.hashtags.map(h => `#${h}`).join(" ")}`,
    input.contextType && `User hint: ${input.contextType}`,
    input.notes && `Notes: ${input.notes}`,
  ].filter(Boolean).join("\n");
  const collectionsHint = input.existingCollections.length
    ? `User's existing collections (prefer one if it fits): ${input.existingCollections.join(", ")}`
    : "User has no existing collections — suggest a short name.";
  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: `You categorize saved web/video items for STASHd.
Categories must be one of: ${CATEGORIES.join(", ")}.
content_type is the PURPOSE of the content (what it's ABOUT), not the media format.
  - A recipe video → content_type "Recipe", NOT "Video"
  - A fashion TikTok → content_type "Fashion"
  - A product demo → content_type "Product"
  - A YouTube tutorial → content_type "Tutorial"
  content_type must be one of: ${CONTENT_TYPES.join(", ")}.
media_format is the TECHNICAL DELIVERY (how it's delivered):
  - Video, Article, Webpage, Social Post, Product Page, Image.
subcategory must be ONE value chosen from this taxonomy for the chosen content_type:
${SUBCATEGORY_HINT}
If none fit, pick the closest. For Recipe, default subcategory is "Dinner" when unclear.
Tags: 3-6 lowercase short tags.

FASHION vs PRODUCTS (critical — apply before any other rule):
- Anything a person wears, carries, or puts on their body → category "Fashion", content_type "Fashion". This includes: dresses, tops, shirts, pants, jeans, shorts, shoes, boots, sneakers, sandals, handbags, purses, bags, jewelry, accessories, swimwear, activewear, coats, jackets, lingerie, socks, hats.
- This rule applies regardless of the retailer: Nordstrom, Target, Amazon, Zara, Altar'd State, Free People, ASOS, Revolve, H&M, TJ Maxx, Macy's, etc. all sell fashion items.
- Subcategory for shoes, boots, sneakers, sandals, heels → "Shoes".
- Subcategory for vacation/resort/travel outfits → "Vacation".
- Non-wearable goods (electronics, appliances, kitchen items, furniture, tools, home decor, lamps) → category "Products", content_type "Product".
- When uncertain: ask "Would someone wear or carry this?" — yes → Fashion, no → Products.

CRITICAL ANTI-HALLUCINATION RULES:
- Only use facts present in the provided fields (Title/Caption/Description/Transcript/User hint/Notes/URL). Never invent specific dishes, products, brands, ingredients, locations, or topics that aren't explicitly mentioned.
- If transcript or caption is present, prefer it as the source of truth.
- If the provided content is empty/generic or only a bare video ID with no caption/transcript/hint, DO NOT guess. Use category "Uncategorized", content_type "Other", a generic title like "<Platform> video", generic neutral summary, empty arrays for recipe/product/travel fields, and a low confidence_score (<= 0.3).
- generated_title: clean user-facing title (max 90 chars). Prefer the exact provided Title/Caption. Never use placeholder text like "Auto-filled".
- summary: one sentence, max 160 chars, grounded strictly in provided text.
- key_takeaways: 0-5 short bullets (max 120 chars each) ONLY when the content clearly teaches/recommends something.
- recipe_ingredients / recipe_steps: ONLY populate when the ingredient list or step-by-step instructions are EXPLICITLY written out in the provided text (caption, transcript, description). For video sources (TikTok, Instagram, YouTube, Reels, Shorts) never infer or invent ingredients/steps from a dish name or title alone — if no explicit list appears in the text, return empty arrays. Recipe websites with schema data are the only reliable source; AI inference from a video title is forbidden.
- recipe_nutrition: ONLY populate if the content explicitly states nutrition facts per serving. Otherwise null. Provide numbers only (no units in values).
- product_names: ONLY populate if the content recommends specific named products. Otherwise empty array.
- product_brand: ONLY populate when a specific brand name is explicitly mentioned for the primary product. Otherwise null.
- product_price: ONLY populate when a specific price is explicitly mentioned. Include currency symbol. Otherwise null.
- product_retailer: The retailer/seller name (Amazon, Target, Etsy, etc.), derivable from URL or description. Otherwise null.
- product_category: Specific product sub-category (Skincare, Blender, etc.) grounded in provided text. Otherwise null.
- product_description: One factual sentence about what the product is/does, grounded strictly in provided text. Otherwise null.
- detected_products: [] unless this is Products/Fashion content with explicitly named products in caption/transcript/hashtags. Each product_name must appear verbatim in the provided text. Never invent or infer from context alone.
- travel_details: ONLY populate if content is travel-related. Object with optional destination, location, activities[]. Otherwise null.
- confidence_score: 0..1 — how confident you are in the categorization based on provided evidence.
- notes: helpful concise note (max 220 chars) based ONLY on provided text.
- suggested_collection: 2-4 words; if unsure, use the platform name or category.
${collectionsHint}` },

      { role: "user", content: content || "No content. Use URL only." },
    ],
    tools: [{
      type: "function",
      function: {
        name: "categorize_item",
        parameters: {
          type: "object",
          properties: {
            category: { type: "string", enum: [...CATEGORIES] },
            content_type: { type: "string", enum: [...CONTENT_TYPES], description: "Content PURPOSE — what is this about? NOT the media format." },
            media_format: { type: "string", enum: ["Video", "Article", "Webpage", "Social Post", "Product Page", "Image"], description: "Technical delivery format." },
            generated_title: { type: "string" },
            subcategory: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            summary: { type: "string" },
            notes: { type: "string" },
            suggested_collection: { type: "string" },
            key_takeaways: { type: "array", items: { type: "string" } },
            recipe_ingredients: { type: "array", items: { type: "string" } },
            recipe_steps: { type: "array", items: { type: "string" } },
            recipe_nutrition: {
              type: ["object", "null"],
              description: "Per-serving nutrition. Only populate when content explicitly states nutrition facts.",
              properties: {
                calories_per_serving: { type: "number" },
                protein_g: { type: "number" },
                carbs_g: { type: "number" },
                fat_g: { type: "number" },
              },
            },
            product_names: { type: "array", items: { type: "string" } },
            product_brand: { type: ["string", "null"], description: "Primary brand name for the product. null if not a product or brand not mentioned." },
            product_price: { type: ["string", "null"], description: "Price with currency symbol e.g. '$29.99'. null if price not mentioned." },
            product_retailer: { type: ["string", "null"], description: "Retailer or seller name (e.g. 'Amazon', 'Target', 'Nordstrom'). null if not identifiable." },
            product_category: { type: ["string", "null"], description: "Specific product category (e.g. 'Skincare', 'Blender', 'Running Shoes'). null if unclear." },
            product_description: { type: ["string", "null"], description: "One sentence product description grounded in provided text. null if not a product." },
            detected_products: {
              type: "array",
              description: "Individual products explicitly named/promoted in this content. ONLY for Products/Fashion saves where specific named items appear in caption, transcript, or hashtags. Return [] for recipes, travel, tutorials, and any content where no specific product name is stated. NEVER invent product names. NEVER use generic terms. Each entry must name a real product explicitly present in the provided text.",
              items: {
                type: "object",
                properties: {
                  product_name: { type: "string", description: "Exact product name as it appears in the text." },
                  brand: { type: ["string", "null"] },
                  retailer: { type: ["string", "null"], description: "Retailer or platform name if identifiable." },
                  price: { type: ["string", "null"], description: "Price with currency symbol if explicitly stated." },
                  original_product_url: { type: ["string", "null"], description: "Direct product URL if found in caption or description." },
                  confidence_score: { type: "number", description: "0.0–1.0 confidence this is a real named product being promoted." },
                  extraction_source: { type: "string", enum: ["caption", "transcript", "hashtag", "description", "metadata"] },
                },
                required: ["product_name", "confidence_score", "extraction_source"],
              },
            },
            travel_details: {
              type: ["object", "null"],
              properties: {
                destination: { type: "string" },
                location: { type: "string" },
                activities: { type: "array", items: { type: "string" } },
              },
            },
            confidence_score: { type: "number" },
          },
          required: [
            "category", "content_type", "media_format", "generated_title", "subcategory", "tags",
            "summary", "notes", "suggested_collection",
            "key_takeaways", "recipe_ingredients", "recipe_steps",
            "product_names", "product_brand", "product_price",
            "product_retailer", "product_category", "product_description",
            "detected_products",
            "confidence_score", "recipe_nutrition",
          ],
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "categorize_item" } },
  };
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    return JSON.parse(args);
  } catch {
    return null;
  }
}

async function findOrCreateInboxCollection(
  userId: string,
  existingCols: { id: string; name: string }[],
): Promise<string | null> {
  const existing = existingCols.find((c) => c.name.toLowerCase() === "inbox");
  if (existing) return existing.id;
  try {
    const { data } = await supabaseAdmin
      .from("collections")
      .insert({ user_id: userId, name: "Inbox" })
      .select("id")
      .single();
    return data?.id ?? null;
  } catch (err) {
    console.warn("[INGEST] Could not create Inbox collection:", err);
    return null;
  }
}

async function embed(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.[0]?.embedding ?? null;
  } catch { return null; }
}

export type IngestInput = {
  userId: string;
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  source?: string | null;
  note?: string | null;
  context_type?: string | null;
  skip_ai?: boolean | null;
  collection_id?: string | null;
  share_source: ShareSource;
  /** When set, UPDATE this existing item ID instead of INSERT (used by instant mode). */
  _preInsertedId?: string;
};

export type IngestResult = {
  item: {
    id: string;
    title: string;
    category: string | null;
    subcategory: string | null;
    tags: string[];
    ai_summary: string | null;
    collection_id: string | null;
    image_url: string | null;
    source: string | null;
    source_platform: string | null;
    processing_status: ProcessingStatus;
    confidence_score: number | null;
  };
  suggested_collection: string | null;
  fetched_metadata: boolean;
  ai_status: "organized" | "needs_info" | "uncategorized";
  needs_info: boolean;
  processing_status: ProcessingStatus;
};

/**
 * Ingest a shared URL: detect platform, fetch metadata, optionally pull
 * transcript (future), AI-categorize into structured fields, save, embed.
 *
 * Pipeline order:
 *   pending → metadata_found → (transcript_found) → ai_processed
 *   on missing context for opaque social videos → needs_user_context
 *   on hard insert failure → failed (we still throw)
 */
// Tracking/referral params that should be stripped from URLs before saving or
// comparing for duplicates.  Extend as needed.
const TRACKING_PARAMS = new Set([
  "igsh", "igshid",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "fbclid", "gclid", "ref", "referrer",
  "is_from_webapp", "_r", "_t",
  "share_app_id", "share_link_id", "sender_device", "sender_web_id",
  "share_id",
]);

/**
 * Strip tracking/referral query params and normalise the URL so that
 * "https://www.instagram.com/reel/X/?igsh=ABC" and
 * "https://www.instagram.com/reel/X/" are treated as the same item.
 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    // Remove empty query string ("?") left after stripping all params
    const qs = u.searchParams.toString();
    return u.origin + u.pathname + (qs ? `?${qs}` : "") + (u.hash || "");
  } catch {
    return raw;
  }
}

export async function ingestSharedUrl(input: IngestInput): Promise<IngestResult> {
  if (!input.url) throw new Error("URL is required");

  // Normalize the incoming URL once — used for dedup check and for storage.
  const canonicalUrl = normalizeUrl(input.url);

  const parsed = new URL(canonicalUrl);
  const platform = detectPlatform(canonicalUrl);

  console.log(`[INGEST] ── START ──────────────────────────────────────`);
  console.log(`[INGEST] URL:      ${canonicalUrl}${canonicalUrl !== input.url ? ` (normalized from ${input.url})` : ""}`);
  console.log(`[INGEST] Platform: ${platform}`);
  console.log(`[INGEST] Source:   ${input.share_source}`);

  // ── Idempotency check ───────────────────────────────────────────────────────
  // Skip when called in background mode (_preInsertedId already exists).
  if (!input._preInsertedId) {
    const { data: existingItem } = await supabaseAdmin
      .from("items")
      .select("id,title,category,subcategory,tags,ai_summary,collection_id,image_url,source,source_platform,processing_status,confidence_score")
      .eq("user_id", input.userId)
      .eq("url", canonicalUrl)
      .maybeSingle();

    if (existingItem) {
      console.log(`[INGEST] Duplicate — returning existing item ${existingItem.id}`);
      const cat = existingItem.category ?? "Uncategorized";
      return {
        item: existingItem,
        suggested_collection: null,
        fetched_metadata: false,
        ai_status: cat !== "Uncategorized" ? "organized" : "uncategorized",
        needs_info: false,
        processing_status: (existingItem.processing_status as ProcessingStatus) ?? "ai_processed",
      };
    }
  }

  let processingStatus: ProcessingStatus = "pending";

  const incomingTitle = isMeaningfulMetadataValue(input.title, canonicalUrl) ? input.title!.trim() : null;
  const incomingDescription = isMeaningfulMetadataValue(input.description) ? input.description!.trim() : null;
  const incomingImage = isMeaningfulMetadataValue(input.image) ? input.image!.trim() : null;
  const userNote = isMeaningfulMetadataValue(input.note) ? input.note!.trim() : "";
  const contextType = isMeaningfulMetadataValue(input.context_type) ? input.context_type!.trim() : "";
  const hasMeta = !!(incomingTitle && incomingDescription && incomingImage);

  console.log(`[INGEST] Incoming: title=${JSON.stringify(incomingTitle)} desc=${JSON.stringify(incomingDescription?.slice(0,60))} image=${!!incomingImage}`);

  let meta: UrlMetadata | null = null;
  if (!hasMeta) {
    try { meta = await fetchMetadata(input.url); } catch (err) { console.warn("[INGEST] Metadata fetch failed:", err); }
  }

  console.log(`[INGEST] Fetched metadata: title=${JSON.stringify(meta?.title?.slice(0,60))} desc=${JSON.stringify(meta?.description?.slice(0,60))} image=${!!meta?.image}`);

  if (incomingTitle || incomingDescription || incomingImage || meta?.title || meta?.description) {
    processingStatus = "metadata_found";
  }

  const host = parsed.hostname.replace(/^www\./, "");

  const platformDefaultTitle: Record<string, string> = {
    instagram_reel: "Instagram Reel",
    instagram: "Instagram Post",
    tiktok: "TikTok Video",
    youtube_short: "YouTube Short",
    youtube: "YouTube Video",
    vimeo: "Vimeo Video",
  };

  const platformDefault = platformDefaultTitle[platform] ?? null;

  const isSocialVideoWithOpaqueUrl = platform === "instagram_reel" || platform === "instagram" || platform === "tiktok";
  const urlDerivedTitle = isSocialVideoWithOpaqueUrl ? null : bestTitleFromUrl(input.url);

  const usableMetaTitle = (meta?.title && meta.title !== urlDerivedTitle && !isSocialVideoWithOpaqueUrl)
    ? meta.title
    : null;

  let title = (incomingTitle || usableMetaTitle || urlDerivedTitle || platformDefault || bestTitleFromUrl(input.url) || host).slice(0, 500);
  const caption = incomingDescription || meta?.description || null;
  let description = caption || "";
  // Filter known Instagram static-asset placeholders before treating as thumbnail
  const rawMetaImage = meta?.image || null;
  let image: string | null = incomingImage
    || (rawMetaImage && !INSTAGRAM_STATIC_RE.test(rawMetaImage) ? rawMetaImage : null)
    || null;
  const source = input.source || meta?.source || host;
  let creator = creatorFromUrl(input.url, platform);

  console.log(`[INGEST] Caption (from metadata): ${caption ? JSON.stringify(caption.slice(0, 120)) : "null"}`);

  // Transcript / caption extraction
  console.log(`[INGEST] Fetching transcript for platform=${platform}…`);
  const transcriptResult = await fetchTranscript(input.url, platform);
  const transcript: string | null = transcriptResult?.text ?? null;

  console.log(`[INGEST] Transcript result: method=${transcriptResult?.method ?? "none"} length=${transcript?.length ?? 0}`);
  if (transcript) {
    console.log(`[INGEST] Transcript (first 200 chars): ${JSON.stringify(transcript.slice(0, 200))}`);
    processingStatus = "transcript_found";
  }

  // ── yt-dlp enrichment (title / creator / thumbnail / tags) ─────────────────
  // When yt-dlp succeeded (YouTube), it returns structured metadata alongside
  // the transcript. Use these to fill gaps the og: metadata couldn't provide.
  const ytEnrich = transcriptResult?.ytdlp ?? null;
  if (ytEnrich) {
    console.log(`[INGEST] yt-dlp enrichment: title=${JSON.stringify(ytEnrich.title?.slice(0,60))} uploader=${JSON.stringify(ytEnrich.uploader)} tags=${ytEnrich.tags.length} thumb=${!!ytEnrich.thumbnail}`);

    // Creator: prefer URL-derived handle, fall back to yt-dlp uploader
    if (!creator && ytEnrich.uploader) {
      creator = ytEnrich.uploader;
      console.log(`[INGEST] creator set from yt-dlp uploader: ${creator}`);
    }

    // Title: only use yt-dlp title if we don't already have a meaningful one
    const isPlatformDefault = title === platformDefault;
    if (ytEnrich.title && (!incomingTitle || isPlatformDefault)) {
      title = ytEnrich.title.slice(0, 500);
      console.log(`[INGEST] title updated from yt-dlp: ${JSON.stringify(title.slice(0,80))}`);
    }

    // Thumbnail: prefer incoming → Apify/yt-dlp → meta
    // For TikTok, meta?.image is an ephemeral api/img URL rejected at the metadata layer,
    // so image will be null and ytEnrich.thumbnail (a stable CDN URL) is used.
    // Reject any TikTok thumbnail that matches DIRTY_TT_RE (api/img OR photomode-video-share-card),
    // as both contain burned-in play overlays and are unsuitable for collage covers.
    const imageIsDirtyTikTok = !!image && platform === "tiktok" && DIRTY_TT_RE.test(image);
    if (ytEnrich.thumbnail && (!image || imageIsDirtyTikTok)) {
      // For TikTok: ytEnrich.thumbnail = Apify videoMeta.coverUrl (clean raw frame)
      // For Instagram: ytEnrich.thumbnail = Apify displayUrl (may have play overlay;
      //   superseded by the oEmbed step below if oEmbed succeeds)
      if (platform === "tiktok" && DIRTY_TT_RE.test(ytEnrich.thumbnail)) {
        // Apify somehow returned a dirty URL too — log and skip
        logThumbnail(platform, input.url, "ytEnrich_dirty_rejected", 1, false, null);
      } else {
        image = ytEnrich.thumbnail;
        logThumbnail(platform, input.url, transcriptResult?.method ?? "ytEnrich", 1, true, image);
      }
    } else {
      logThumbnail(platform, input.url, transcriptResult?.method ?? "ytEnrich", 1, false, null);
    }
  }

  // ── Instagram: prefer oEmbed clean poster over Apify/og:image ────────────────
  // Both Apify displayUrl and Instagram's og:image for video posts can include a
  // burned-in play overlay. Instagram oEmbed returns a raw static poster frame
  // without any UI overlays. Only run for Instagram; YouTube and TikTok have clean
  // sources already (yt-dlp maxresdefault and Apify coverUrl respectively).
  if (platform === "instagram_reel" || platform === "instagram") {
    const oembedThumb = await fetchInstagramOembedThumbnail(canonicalUrl);
    if (oembedThumb) {
      image = oembedThumb;
      logThumbnail(platform, input.url, "ig_oembed", 1, true, image);
    }
  }

  // Cache hotlink-protected thumbnails (Instagram/TikTok CDN URLs are blocked in browsers)
  const isHotlinkProtected = platform === "tiktok" || platform === "instagram" || platform === "instagram_reel";
  if (image && isHotlinkProtected) {
    image = await cacheThumbnailToStorage(image, platform, canonicalUrl);
  }

  // Existing collection names (for AI hint)
  const { data: cols } = await supabaseAdmin
    .from("collections").select("id,name").eq("user_id", input.userId);
  const existingNames = (cols ?? []).map((c) => c.name);

  // "Needs user context" = video platform with no caption/transcript/note/hint.
  // IMPORTANT: when opaqueVideo=true we must NOT call OpenAI — it will hallucinate
  // generic output ("Instagram post", "Uncategorized") from an empty prompt.
  const opaqueVideo = isVideoPlatform(platform)
    && !incomingTitle && !caption && !transcript && !userNote && !contextType;

  console.log(`[INGEST] opaqueVideo=${opaqueVideo} | caption=${!!caption} transcript=${!!transcript} note=${!!userNote} hint=${!!contextType}`);

  const cleanArr = (v: any, max = 8, maxLen = 200): string[] =>
    Array.isArray(v)
      ? v.map((t: any) => String(t).replace(/^#/, "").trim()).filter(Boolean).slice(0, max)
         .map((s) => s.slice(0, maxLen))
      : [];

  let category: string;
  let contentType: string;
  let mediaFormat: string;
  let tags: string[];
  let keyTakeaways: string[];
  let recipeIngredients: string[];
  let recipeSteps: string[];
  let recipeNutrition: any;
  let productNames: string[];
  let productBrand: string | null;
  let productPrice: string | null;
  let productRetailer: string | null;
  let productCategory: string | null;
  let productDescription: string | null;
  let productImageUrl: string | null;
  let detectedProducts: any[];
  let travelDetails: any;
  let confidence: number | null;
  let subcategory: string | null;
  let summary: string | null;
  let suggestedCollection: string | null = null;
  let inboxCollectionId: string | null = null;

  if (opaqueVideo) {
    // No extractable content — save immediately to Inbox so nothing is lost.
    console.log(`[INGEST] Opaque video — saving to Inbox without AI`);
    inboxCollectionId = await findOrCreateInboxCollection(input.userId, cols ?? []);
    category = "Uncategorized";
    contentType = "Other";
    mediaFormat = platformToMediaFormat(platform);
    tags = [platform.replace(/_/g, "-")];
    keyTakeaways = [];
    recipeIngredients = [];
    recipeSteps = [];
    productNames = [];
    productBrand = null;
    productPrice = null;
    productRetailer = null;
    productCategory = null;
    productDescription = null;
    productImageUrl = null;
    detectedProducts = [];
    travelDetails = null;
    confidence = null;
    subcategory = null;
    summary = null;
    suggestedCollection = "Inbox";
    processingStatus = "ai_processed";
  } else {
    // We have at least some content — call OpenAI.
    // Hashtags from yt-dlp (YouTube tags) or Apify (Instagram/TikTok hashtags)
    const enrichHashtags = ytEnrich?.tags?.length ? ytEnrich.tags.slice(0, 10) : [];
    // If no explicit caption (Apify/description), derive a clean one from the transcript
    // by stripping the Instagram engagement header: "138K likes ... on Date: "caption text""
    const captionForAi = caption || (transcript ? extractCaptionText(transcript) : null);
    console.log(`[INGEST] AI input: caption_src=${caption ? "explicit" : transcript ? "transcript_cleaned" : "none"} caption_len=${captionForAi?.length ?? 0} transcript_len=${transcript?.length ?? 0}`);
    if (captionForAi) console.log(`[INGEST] Caption preview: ${JSON.stringify(captionForAi.slice(0, 150))}`);

    const aiInput = {
      url: canonicalUrl, title, description, source,
      platform, creator,
      caption: captionForAi,   // clean caption text sent to AI
      transcript,               // raw og:description kept for DB storage
      hashtags: enrichHashtags.length ? enrichHashtags : undefined,
      notes: userNote,
      contextType,
      existingCollections: existingNames,
    };
    const aiPromptText = [
      `URL: ${input.url}`,
      `Platform: ${platform}`,
      creator && `Creator: ${creator}`,
      captionForAi && `Caption: ${captionForAi.slice(0, 400)}`,
      enrichHashtags.length && `Hashtags: ${enrichHashtags.map(h => `#${h}`).join(" ")}`,
      userNote && `Note: ${userNote}`,
      contextType && `Hint: ${contextType}`,
    ].filter(Boolean).join("\n");
    console.log(`[INGEST] Sending to OpenAI:\n${aiPromptText}`);

    const ai = input.skip_ai ? null : await aiCategorize(aiInput);

    console.log(`[INGEST] OpenAI response: category=${ai?.category} title=${JSON.stringify(ai?.generated_title)} confidence=${ai?.confidence_score}`);
    console.log(`[INGEST] OpenAI summary: ${JSON.stringify(ai?.summary)}`);
    console.log(`[INGEST] OpenAI tags: ${JSON.stringify(ai?.tags)}`);

    category = ai?.category && (CATEGORIES as readonly string[]).includes(ai.category) ? ai.category : "Uncategorized";
    contentType = ai?.content_type && (CONTENT_TYPES as readonly string[]).includes(ai.content_type)
      ? ai.content_type
      : contentTypeFromCategory(category);
    mediaFormat = typeof ai?.media_format === "string" && ai.media_format.length > 0
      ? ai.media_format
      : (meta?.media_format ?? platformToMediaFormat(platform));
    tags = cleanArr(ai?.tags, 8, 60).map((t) => t.toLowerCase());
    keyTakeaways = cleanArr(ai?.key_takeaways, 6, 240);
    recipeIngredients = cleanArr(ai?.recipe_ingredients, 40, 200);
    recipeSteps = cleanArr(ai?.recipe_steps, 30, 600);
    recipeNutrition =
      ai?.recipe_nutrition && typeof ai.recipe_nutrition === "object" && !Array.isArray(ai.recipe_nutrition)
        ? ai.recipe_nutrition
        : null;

    // JSON-LD structured recipe data is more accurate than AI extraction —
    // prefer it whenever the source page had a Recipe schema
    if (meta?.recipe_ingredients && meta.recipe_ingredients.length > 0) {
      recipeIngredients = meta.recipe_ingredients.slice(0, 40).map((s) => s.slice(0, 200));
      console.log(`[INGEST] JSON-LD ingredients: ${recipeIngredients.length} items (overriding AI)`);
    }
    if (meta?.recipe_steps && meta.recipe_steps.length > 0) {
      recipeSteps = meta.recipe_steps.slice(0, 30).map((s) => s.slice(0, 600));
      console.log(`[INGEST] JSON-LD steps: ${recipeSteps.length} items (overriding AI)`);
    }
    if (meta?.recipe_nutrition) {
      recipeNutrition = meta.recipe_nutrition;
      console.log(`[INGEST] JSON-LD nutrition: ${JSON.stringify(meta.recipe_nutrition)}`);
    }
    productNames = cleanArr(ai?.product_names, 20, 200);
    productBrand = ai?.product_brand ? String(ai.product_brand).slice(0, 200) : null;
    productPrice = ai?.product_price ? String(ai.product_price).slice(0, 100) : null;
    productRetailer = ai?.product_retailer ? String(ai.product_retailer).slice(0, 200) : null;
    productCategory = ai?.product_category ? String(ai.product_category).slice(0, 200) : null;
    productDescription = ai?.product_description ? String(ai.product_description).slice(0, 500) : null;
    productImageUrl = null; // set from JSON-LD only
    // JSON-LD Product fields override AI
    if (meta?.product_brand) { productBrand = meta.product_brand; console.log(`[INGEST] JSON-LD product_brand: ${productBrand}`); }
    if (meta?.product_price) { productPrice = meta.product_price; console.log(`[INGEST] JSON-LD product_price: ${productPrice}`); }
    if (meta?.product_retailer) { productRetailer = meta.product_retailer; console.log(`[INGEST] JSON-LD product_retailer: ${productRetailer}`); }
    if (meta?.product_category) { productCategory = meta.product_category; console.log(`[INGEST] JSON-LD product_category: ${productCategory}`); }
    if (meta?.product_description) { productDescription = meta.product_description; console.log(`[INGEST] JSON-LD product_description length: ${productDescription.length}`); }
    if (meta?.product_image_url) { productImageUrl = meta.product_image_url; console.log(`[INGEST] JSON-LD product_image_url: ${productImageUrl}`); }

    // Merge AI-extracted detected products with product links found in caption/transcript text
    const aiDetectedProducts = Array.isArray(ai?.detected_products) ? ai.detected_products : [];
    const textToScan = [captionForAi, transcript].filter(Boolean).join(" ");
    const urlExtracted = extractProductLinksFromText(textToScan)
      .filter(link => !aiDetectedProducts.some((p: any) => p.original_product_url === link.url))
      .map(link => ({
        product_name: bestTitleFromUrl(link.url) ?? link.retailer ?? "Product",
        brand: null as string | null,
        retailer: link.retailer,
        price: null as string | null,
        original_product_url: link.url,
        confidence_score: 0.6,
        extraction_source: "shop_link" as const,
        image_url: null as string | null,
      }));
    detectedProducts = [...aiDetectedProducts, ...urlExtracted];
    if (detectedProducts.length) console.log(`[INGEST] detected_products: ${detectedProducts.length} items`);

    travelDetails =
      ai?.travel_details && typeof ai.travel_details === "object" && !Array.isArray(ai.travel_details)
        ? ai.travel_details
        : null;
    confidence = typeof ai?.confidence_score === "number"
      ? Math.max(0, Math.min(1, ai.confidence_score))
      : null;
    subcategory = ai?.subcategory ? String(ai.subcategory).slice(0, 200) : null;
    summary = ai?.summary ? String(ai.summary).slice(0, 240) : null;
    const aiNotes = ai?.notes ? String(ai.notes).trim() : "";
    const aiTitle = ai?.generated_title ? String(ai.generated_title).trim() : "";

    const isPlatformDefaultTitle = Object.values(platformDefaultTitle).includes(title);
    if (aiTitle && isMeaningfulMetadataValue(aiTitle, input.url)) {
      if (!incomingTitle && (!meta?.title || isPlatformDefaultTitle)) {
        title = aiTitle.slice(0, 500);
      }
    }
    if (!description) description = userNote || aiNotes || summary || "";
    if (!image && meta?.image) image = meta.image;

    suggestedCollection = ai?.suggested_collection ? String(ai.suggested_collection).slice(0, 80) : null;
    if (ai) processingStatus = "ai_processed";
  }

  logThumbnail(platform, input.url, "final", 1, !!image, image);
  console.log(`[INGEST] Final: title=${JSON.stringify(title)} category=${category} status=${processingStatus} image=${!!image}`);

  // Core fields — guaranteed to exist in the schema.
  // Optional enrichment fields are spread on top; if a column is missing in the
  // DB the fallback retry below will still save the item with just the core fields.
  const corePayload: Record<string, any> = {
    user_id: input.userId,
    collection_id: inboxCollectionId ?? input.collection_id ?? null,
    title,
    url: canonicalUrl,
    description: description || null,
    image_url: image ?? null,
    source: source || null,
    type: contentType,
    tags,
    category,
    subcategory,
    ai_summary: summary,
    share_source: input.share_source,
    processing_status: processingStatus,
  };

  // Enrichment fields added to schema over time — omit if undefined/null so a
  // missing column causes an error we can catch rather than a silent null write.
  const enrichmentPayload: Record<string, any> = {};
  if (mediaFormat != null)    enrichmentPayload.media_format      = mediaFormat;
  if (platform != null)       enrichmentPayload.source_platform   = platform;
  if (creator != null)        enrichmentPayload.creator_name      = creator;
  if (transcript != null)     enrichmentPayload.transcript        = transcript;
  if (!opaqueVideo)           enrichmentPayload.ai_category       = category;
  if (subcategory != null)    enrichmentPayload.ai_subcategory    = subcategory;
  if (tags.length)            enrichmentPayload.ai_tags           = tags;
  if (keyTakeaways.length)    enrichmentPayload.ai_key_takeaways  = keyTakeaways;
  if (recipeIngredients.length) enrichmentPayload.recipe_ingredients = recipeIngredients;
  if (recipeSteps.length)     enrichmentPayload.recipe_steps      = recipeSteps;
  if (recipeNutrition != null) enrichmentPayload.recipe_nutrition  = recipeNutrition;
  if (productNames.length)    enrichmentPayload.product_names     = productNames;
  if (productBrand != null)       enrichmentPayload.product_brand       = productBrand;
  if (productPrice != null)       enrichmentPayload.product_price       = productPrice;
  if (productRetailer != null)    enrichmentPayload.product_retailer    = productRetailer;
  if (productCategory != null)    enrichmentPayload.product_category    = productCategory;
  if (productDescription != null) enrichmentPayload.product_description = productDescription;
  if (productImageUrl != null)    enrichmentPayload.product_image_url   = productImageUrl;
  if (detectedProducts.length)    enrichmentPayload.detected_products   = detectedProducts;
  if (travelDetails != null)  enrichmentPayload.travel_details    = travelDetails;
  if (confidence != null)     enrichmentPayload.confidence_score  = confidence;

  const captionValue = caption ?? (
    (platform === "instagram_reel" || platform === "instagram" || platform === "tiktok") && transcript
      ? transcript
      : null
  );
  if (captionValue != null)   enrichmentPayload.original_caption  = captionValue;

  const SELECT_COLS = "id,title,category,subcategory,tags,ai_summary,collection_id,image_url,source,source_platform,processing_status,confidence_score";

  let inserted: any;

  if (input._preInsertedId) {
    // ── Background enrichment mode: UPDATE the pre-inserted item ──────────────
    console.log(`[INGEST] Background UPDATE for item ${input._preInsertedId}`);
    const { user_id: _uid, url: _u, share_source: _ss, ...updateableCore } = corePayload;
    const updateData = { ...updateableCore, ...enrichmentPayload };

    let { data: updated, error: updErr } = await supabaseAdmin
      .from("items")
      .update(updateData)
      .eq("id", input._preInsertedId)
      .eq("user_id", input.userId)
      .select(SELECT_COLS)
      .single();

    if (updErr || !updated) {
      console.warn(`[INGEST-BG] Full update failed (${updErr?.message}) — retrying without media_format`);
      const { media_format: _mf, ...withoutMf } = updateData;
      const attempt2 = await supabaseAdmin
        .from("items")
        .update(withoutMf)
        .eq("id", input._preInsertedId)
        .eq("user_id", input.userId)
        .select(SELECT_COLS)
        .single();
      if (!attempt2.error && attempt2.data) {
        updated = attempt2.data as typeof updated;
        updErr = null;
      } else {
        console.warn(`[INGEST-BG] Update failed entirely for ${input._preInsertedId}: ${attempt2.error?.message}`);
      }
    }
    inserted = updated ?? { id: input._preInsertedId };
  } else {
    // ── Normal INSERT mode ──────────────────────────────────────────────────────
    let insErr: any;
    // Attempt 1: full payload
    let insResult = await supabaseAdmin
      .from("items")
      .insert({ ...corePayload, ...enrichmentPayload })
      .select(SELECT_COLS)
      .single();
    inserted = insResult.data;
    insErr = insResult.error;

    // Attempt 2: strip media_format (unapplied migration)
    if (insErr || !inserted) {
      console.warn(`[INGEST] Full insert failed (${insErr?.message}) — retrying without media_format`);
      const { media_format: _mf, ...enrichWithoutMediaFormat } = enrichmentPayload;
      const attempt2 = await supabaseAdmin
        .from("items")
        .insert({ ...corePayload, ...enrichWithoutMediaFormat })
        .select(SELECT_COLS)
        .single();
      if (!attempt2.error && attempt2.data) {
        inserted = attempt2.data as typeof inserted;
        insErr = null;
      } else {
        // Attempt 3: core payload only
        console.warn(`[INGEST] Attempt 2 also failed (${attempt2.error?.message}) — falling back to core payload`);
        const fallback = await supabaseAdmin
          .from("items")
          .insert(corePayload)
          .select("id,title,category,subcategory,tags,ai_summary,collection_id,image_url,source,processing_status")
          .single();
        if (fallback.error || !fallback.data) {
          throw new Error(fallback.error?.message || insErr?.message || "Failed to save item");
        }
        inserted = fallback.data as typeof inserted;
      }
    }
  }

  // Background thumbnail refresh — fire-and-forget if image wasn't found at ingest time
  if (!image && (platform === "tiktok" || platform === "instagram" || platform === "instagram_reel")) {
    const itemIdForRefresh = inserted?.id;
    if (itemIdForRefresh) {
      refreshThumbnailBackground(itemIdForRefresh, input.url, platform).catch((err) => {
        console.warn(`[THUMBNAIL-REFRESH] background refresh error: ${err}`);
      });
    }
  }

  // Embedding (best-effort)
  try {
    let collectionName: string | null = null;
    if (inserted.collection_id) {
      collectionName = cols?.find((c) => c.id === inserted.collection_id)?.name
        ?? (opaqueVideo ? "Inbox" : null);
    }
    const text = [
      inserted.title && `Title: ${inserted.title}`,
      inserted.category && `Category: ${inserted.category}`,
      inserted.subcategory && `Subcategory: ${inserted.subcategory}`,
      collectionName && `Collection: ${collectionName}`,
      inserted.tags?.length && `Tags: ${inserted.tags.join(", ")}`,
      keyTakeaways.length && `Takeaways: ${keyTakeaways.join(" | ")}`,
      productNames.length && `Products: ${productNames.join(", ")}`,
      recipeIngredients.length && `Ingredients: ${recipeIngredients.join(", ")}`,
      inserted.ai_summary && `Summary: ${inserted.ai_summary}`,
      caption && `Caption: ${caption}`,
      description && `Notes: ${description}`,
      source && `Source: ${source}`,
      platform && `Platform: ${platform}`,
    ].filter(Boolean).join("\n");
    const vec = await embed(text);
    if (vec) {
      await supabaseAdmin.from("items")
        .update({ embedding: vec as any, embedding_updated_at: new Date().toISOString() })
        .eq("id", inserted.id);
    }
  } catch (err) { console.warn("Embed failed", err); }

  const ai_status: "organized" | "needs_info" | "uncategorized" =
    category !== "Uncategorized" ? "organized" : "uncategorized";

  return {
    item: {
      ...(inserted as any),
      processing_status: processingStatus,
    },
    suggested_collection: suggestedCollection,
    fetched_metadata: !!meta,
    ai_status,
    needs_info: false,
    processing_status: processingStatus,
  };
}

// ─── Recategorize an existing item from a user note ──────────────────────────
// Used by the ItemCard "What do you want STASHd to remember?" flow.
// Fetches the saved item, runs AI with the note, updates all AI fields.

export type RecategorizeInput = {
  userId: string;
  itemId: string;
  note: string;
};

export type RecategorizeResult = {
  id: string;
  title: string;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  ai_summary: string | null;
  ai_category: string | null;
  ai_subcategory: string | null;
  ai_tags: string[];
  ai_key_takeaways: string[];
  recipe_ingredients: string[];
  recipe_steps: string[];
  recipe_nutrition: Record<string, unknown> | null;
  product_names: string[];
  confidence_score: number | null;
  processing_status: string;
};

export async function recategorizeItem(input: RecategorizeInput): Promise<RecategorizeResult> {
  const { userId, itemId, note } = input;
  const trimmedNote = note.trim();

  // Fetch the existing item (server-side, admin client)
  const { data: item, error: fetchErr } = await supabaseAdmin
    .from("items")
    .select("id,url,title,source,source_platform,creator_name,original_caption,transcript,image_url,collection_id,user_id,description,ai_summary")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single();

  if (fetchErr || !item) throw new Error(fetchErr?.message || "Item not found");

  const platform = (item.source_platform ?? "web") as SourcePlatform;

  // Fetch URL metadata to extract JSON-LD recipe data (exact structured data beats AI)
  let urlMeta: UrlMetadata | null = null;
  if (item.url) {
    try {
      urlMeta = await fetchMetadata(item.url);
      if (urlMeta?.recipe_ingredients?.length || urlMeta?.recipe_steps?.length) {
        console.log(`[RECATEGORIZE] JSON-LD recipe found: ingredients=${urlMeta.recipe_ingredients?.length ?? 0} steps=${urlMeta.recipe_steps?.length ?? 0}`);
      }
    } catch (err) {
      console.warn(`[RECATEGORIZE] URL metadata fetch failed: ${err}`);
    }
  }

  // Build context for AI — prefer explicit user note, fall back to existing item data
  const contextNote = trimmedNote
    || (item as any).description
    || (item as any).ai_summary
    || item.title
    || "";

  // Existing collections for the suggested_collection hint
  const { data: cols } = await supabaseAdmin
    .from("collections").select("id,name").eq("user_id", userId);
  const existingNames = (cols ?? []).map((c) => c.name);

  const cleanArr = (v: any, max = 8, maxLen = 200): string[] =>
    Array.isArray(v)
      ? v.map((t: any) => String(t).replace(/^#/, "").trim()).filter(Boolean).slice(0, max)
         .map((s: string) => s.slice(0, maxLen))
      : [];

  console.log(`[RECATEGORIZE] item=${itemId} platform=${platform} note=${JSON.stringify(contextNote.slice(0, 120))}`);

  const ai = await aiCategorize({
    url: item.url ?? "",
    title: item.title ?? "",
    description: "",
    source: item.source ?? "",
    platform,
    creator: item.creator_name ?? null,
    caption: item.original_caption ?? null,
    transcript: item.transcript ?? null,
    notes: contextNote,
    existingCollections: existingNames,
  });

  console.log(`[RECATEGORIZE] OpenAI response: category=${ai?.category} title=${JSON.stringify(ai?.generated_title)} confidence=${ai?.confidence_score}`);

  const CATS = CATEGORIES as readonly string[];
  const category = ai?.category && CATS.includes(ai.category) ? ai.category : "Uncategorized";
  const tags = cleanArr(ai?.tags, 8, 60).map((t: string) => t.toLowerCase());
  const keyTakeaways = cleanArr(ai?.key_takeaways, 6, 240);
  let recipeIngredients = cleanArr(ai?.recipe_ingredients, 40, 200);
  let recipeSteps = cleanArr(ai?.recipe_steps, 30, 600);
  let recipeNutritionRe: Record<string, unknown> | null =
    ai?.recipe_nutrition && typeof ai.recipe_nutrition === "object" && !Array.isArray(ai.recipe_nutrition)
      ? (ai.recipe_nutrition as Record<string, unknown>) : null;

  // Prefer JSON-LD structured recipe data over AI extraction
  if (urlMeta?.recipe_ingredients && urlMeta.recipe_ingredients.length > 0) {
    recipeIngredients = urlMeta.recipe_ingredients.slice(0, 40).map((s) => s.slice(0, 200));
    console.log(`[RECATEGORIZE] JSON-LD ingredients: ${recipeIngredients.length} items (overriding AI)`);
  }
  if (urlMeta?.recipe_steps && urlMeta.recipe_steps.length > 0) {
    recipeSteps = urlMeta.recipe_steps.slice(0, 30).map((s) => s.slice(0, 600));
    console.log(`[RECATEGORIZE] JSON-LD steps: ${recipeSteps.length} items (overriding AI)`);
  }
  if (urlMeta?.recipe_nutrition) {
    recipeNutritionRe = urlMeta.recipe_nutrition as Record<string, unknown>;
  }
  const productNames = cleanArr(ai?.product_names, 20, 200);
  let productBrandRe: string | null = ai?.product_brand ? String(ai.product_brand).slice(0, 200) : null;
  let productPriceRe: string | null = ai?.product_price ? String(ai.product_price).slice(0, 100) : null;
  let productRetailerRe: string | null = ai?.product_retailer ? String(ai.product_retailer).slice(0, 200) : null;
  let productCategoryRe: string | null = ai?.product_category ? String(ai.product_category).slice(0, 200) : null;
  let productDescriptionRe: string | null = ai?.product_description ? String(ai.product_description).slice(0, 500) : null;
  let productImageUrlRe: string | null = null;
  if (urlMeta?.product_brand) { productBrandRe = urlMeta.product_brand; console.log(`[RECATEGORIZE] JSON-LD product_brand: ${productBrandRe}`); }
  if (urlMeta?.product_price) { productPriceRe = urlMeta.product_price; console.log(`[RECATEGORIZE] JSON-LD product_price: ${productPriceRe}`); }
  if (urlMeta?.product_retailer) { productRetailerRe = urlMeta.product_retailer; console.log(`[RECATEGORIZE] JSON-LD product_retailer: ${productRetailerRe}`); }
  if (urlMeta?.product_category) { productCategoryRe = urlMeta.product_category; console.log(`[RECATEGORIZE] JSON-LD product_category: ${productCategoryRe}`); }
  if (urlMeta?.product_description) { productDescriptionRe = urlMeta.product_description; }
  if (urlMeta?.product_image_url) { productImageUrlRe = urlMeta.product_image_url; }

  // Merge AI-extracted + URL-scanned product links
  const aiDetectedProductsRe = Array.isArray(ai?.detected_products) ? ai.detected_products : [];
  const reTextToScan = [item.original_caption, item.transcript].filter(Boolean).join(" ");
  const reUrlExtracted = reTextToScan
    ? extractProductLinksFromText(reTextToScan)
        .filter((link: { url: string }) => !aiDetectedProductsRe.some((p: any) => p.original_product_url === link.url))
        .map((link: { url: string; retailer: string | null }) => ({
          product_name: bestTitleFromUrl(link.url) ?? link.retailer ?? "Product",
          brand: null as string | null,
          retailer: link.retailer,
          price: null as string | null,
          original_product_url: link.url,
          confidence_score: 0.6,
          extraction_source: "shop_link" as const,
          image_url: null as string | null,
        }))
    : [];
  const detectedProductsRe = [...aiDetectedProductsRe, ...reUrlExtracted];
  if (detectedProductsRe.length) console.log(`[RECATEGORIZE] detected_products: ${detectedProductsRe.length} items`);

  const travelDetails =
    ai?.travel_details && typeof ai.travel_details === "object" && !Array.isArray(ai.travel_details)
      ? ai.travel_details : null;
  const confidence = typeof ai?.confidence_score === "number"
    ? Math.max(0, Math.min(1, ai.confidence_score)) : null;
  const subcategory = ai?.subcategory ? String(ai.subcategory).slice(0, 200) : null;
  const summary = ai?.summary ? String(ai.summary).slice(0, 240) : null;
  const aiTitle = ai?.generated_title ? String(ai.generated_title).trim() : "";

  const recategorizeContentType = ai?.content_type && (CONTENT_TYPES as readonly string[]).includes(ai.content_type)
    ? ai.content_type
    : contentTypeFromCategory(category);

  // Build update payload.
  // user_edited is reset to false because the user explicitly clicked "Organize with AI",
  // which counts as opting back into AI categorization.
  const updatePayload: Record<string, any> = {
    type: recategorizeContentType,
    category,
    subcategory,
    tags,
    ai_summary: summary,
    ai_category: category,
    ai_subcategory: subcategory,
    ai_tags: tags,
    user_edited: false,
    edited_at: null,
    ai_key_takeaways: keyTakeaways,
    recipe_ingredients: recipeIngredients,
    recipe_steps: recipeSteps,
    recipe_nutrition: recipeNutritionRe,
    product_names: productNames,
    product_brand: productBrandRe,
    product_price: productPriceRe,
    product_retailer: productRetailerRe,
    product_category: productCategoryRe,
    product_description: productDescriptionRe,
    ...(productImageUrlRe ? { product_image_url: productImageUrlRe } : {}),
    ...(detectedProductsRe.length ? { detected_products: detectedProductsRe } : {}),
    travel_details: travelDetails,
    confidence_score: confidence,
    processing_status: "ai_processed",
    // Only overwrite description when the user explicitly typed a note
    ...(trimmedNote ? { description: trimmedNote } : {}),
  };

  if (aiTitle && isMeaningfulMetadataValue(aiTitle, item.url ?? "")) {
    updatePayload.title = aiTitle.slice(0, 500);
  }

  let { data: updated, error: updErr } = await supabaseAdmin
    .from("items")
    .update(updatePayload as any)
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("id,title,category,subcategory,tags,ai_summary,ai_category,ai_subcategory,ai_tags,ai_key_takeaways,recipe_ingredients,recipe_steps,recipe_nutrition,product_names,product_brand,product_price,product_retailer,product_category,product_description,product_image_url,detected_products,confidence_score,processing_status")
    .single();

  // Fallback: if update failed (likely a missing column from pending migration), retry without enrichment fields
  if (updErr || !updated) {
    console.warn(`[RECATEGORIZE] Full update failed (${updErr?.message}) — retrying without new columns`);
    const { recipe_nutrition: _rn, travel_details: _td, ...coreUpdatePayload } = updatePayload;
    const fallback = await supabaseAdmin
      .from("items")
      .update(coreUpdatePayload as any)
      .eq("id", itemId)
      .eq("user_id", userId)
      .select("id,title,category,subcategory,tags,ai_summary,ai_category,ai_subcategory,ai_tags,ai_key_takeaways,recipe_ingredients,recipe_steps,product_names,confidence_score,processing_status")
      .single();
    if (fallback.error || !fallback.data) throw new Error(fallback.error?.message || updErr?.message || "Failed to update item");
    updated = fallback.data as typeof updated;
    updErr = null;
  }

  // Re-embed best-effort
  try {
    const text = [
      updated.title && `Title: ${updated.title}`,
      updated.category && `Category: ${updated.category}`,
      updated.subcategory && `Subcategory: ${updated.subcategory}`,
      updated.tags?.length && `Tags: ${updated.tags.join(", ")}`,
      keyTakeaways.length && `Takeaways: ${keyTakeaways.join(" | ")}`,
      productNames.length && `Products: ${productNames.join(", ")}`,
      recipeIngredients.length && `Ingredients: ${recipeIngredients.join(", ")}`,
      updated.ai_summary && `Summary: ${updated.ai_summary}`,
      trimmedNote && `Notes: ${trimmedNote}`,
    ].filter(Boolean).join("\n");
    const vec = await embed(text);
    if (vec) {
      await supabaseAdmin.from("items")
        .update({ embedding: vec as any, embedding_updated_at: new Date().toISOString() })
        .eq("id", itemId);
    }
  } catch (err) { console.warn("[RECATEGORIZE] Embed failed", err); }

  return updated as RecategorizeResult;
}

export async function getUserIdFromBearer(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Resolves a user ID from either:
 *   - `Authorization: Bearer <supabase_jwt>` (standard session token)
 *   - `X-Save-Token: stv1_<userId>_<hmac>` (long-lived personal save token)
 */
export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const saveToken = request.headers.get("x-save-token") || "";
  if (saveToken) {
    const { validateSaveToken } = await import("./save-token.server");
    return validateSaveToken(saveToken);
  }
  return getUserIdFromBearer(request);
}

/**
 * Instant save: insert a skeleton item immediately (processing_status = "pending"),
 * then fire the full enrichment pipeline in the background.
 * Returns in ~200 ms — the user sees "Saved" right away.
 */
export async function ingestSharedUrlInstant(input: IngestInput): Promise<IngestResult> {
  if (!input.url) throw new Error("URL is required");
  const canonicalUrl = normalizeUrl(input.url);
  const platform = detectPlatform(canonicalUrl);
  const host = new URL(canonicalUrl).hostname.replace(/^www\./, "");

  // Dedup check — still important to avoid double-saves
  const { data: existingItem } = await supabaseAdmin
    .from("items")
    .select("id,title,category,subcategory,tags,ai_summary,collection_id,image_url,source,source_platform,processing_status,confidence_score")
    .eq("user_id", input.userId)
    .eq("url", canonicalUrl)
    .maybeSingle();

  if (existingItem) {
    console.log(`[INGEST-INSTANT] Duplicate — returning existing item ${existingItem.id}`);
    const cat = existingItem.category ?? "Uncategorized";
    return {
      item: existingItem,
      suggested_collection: null,
      fetched_metadata: false,
      ai_status: cat !== "Uncategorized" ? "organized" : "uncategorized",
      needs_info: false,
      processing_status: (existingItem.processing_status as ProcessingStatus) ?? "ai_processed",
    };
  }

  const platformDefaultTitle: Record<string, string> = {
    instagram_reel: "Instagram Reel",
    instagram: "Instagram Post",
    tiktok: "TikTok Video",
    youtube_short: "YouTube Short",
    youtube: "YouTube Video",
    vimeo: "Vimeo Video",
    pinterest: "Pinterest Pin",
  };

  const quickTitle = (
    (isMeaningfulMetadataValue(input.title, canonicalUrl) ? input.title!.trim() : null) ||
    platformDefaultTitle[platform] ||
    bestTitleFromUrl(canonicalUrl) ||
    host
  ).slice(0, 500);

  console.log(`[INGEST-INSTANT] Fast insert: url=${canonicalUrl} title=${JSON.stringify(quickTitle)}`);

  const { data: newItem, error: insErr } = await supabaseAdmin
    .from("items")
    .insert({
      user_id: input.userId,
      url: canonicalUrl,
      title: quickTitle,
      source: host,
      type: "Other",
      tags: [],
      category: "Uncategorized",
      processing_status: "pending" as ProcessingStatus,
      share_source: input.share_source,
      source_platform: platform,
    })
    .select("id,title,category,subcategory,tags,ai_summary,collection_id,image_url,source,source_platform,processing_status,confidence_score")
    .single();

  if (insErr || !newItem) throw new Error(insErr?.message || "Fast insert failed");

  console.log(`[INGEST-INSTANT] Inserted ${newItem.id} — firing background enrichment`);

  // Fire background enrichment — do not await
  void ingestSharedUrl({ ...input, url: canonicalUrl, _preInsertedId: newItem.id }).catch((err) => {
    console.error(`[INGEST-INSTANT] Background enrichment failed for ${newItem.id}:`, err);
  });

  return {
    item: newItem,
    suggested_collection: null,
    fetched_metadata: false,
    ai_status: "uncategorized",
    needs_info: false,
    processing_status: "pending",
  };
}
