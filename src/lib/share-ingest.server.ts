// Server-only: shared "ingest a URL → AI categorize → save → embed" pipeline
// used by the Chrome extension, PWA share target, and any future native
// mobile share handlers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bestTitleFromUrl, fetchMetadata, isMeaningfulMetadataValue, type UrlMetadata } from "./url-metadata.server";
import { fetchTranscript } from "./transcript.server";

export const SHARE_SOURCES = [
  "web",
  "extension",
  "pwa_share",
  "ios_shortcut",
  "mobile_app",
] as const;
export type ShareSource = (typeof SHARE_SOURCES)[number];

const CATEGORIES = [
  "Products", "Fashion", "Beauty", "Home", "Recipes", "Travel", "Fitness",
  "Parenting", "Business Ideas", "Shopping Deals", "Entertainment",
  "Videos", "Education", "Uncategorized", "Other",
] as const;

export type SourcePlatform =
  | "tiktok"
  | "instagram_reel"
  | "instagram"
  | "youtube_short"
  | "youtube"
  | "vimeo"
  | "pinterest"
  | "video"
  | "web";

export type ProcessingStatus =
  | "pending"
  | "metadata_found"
  | "transcript_found"
  | "ai_processed"
  | "needs_user_context"
  | "failed";

function detectPlatform(rawUrl: string): SourcePlatform {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.toLowerCase();
    if (host.endsWith("tiktok.com")) return "tiktok";
    if (host.endsWith("instagram.com")) {
      if (/\/(reel|reels)\//.test(path)) return "instagram_reel";
      return "instagram";
    }
    if (host.endsWith("youtube.com") || host === "youtu.be") {
      if (/\/shorts\//.test(path)) return "youtube_short";
      return "youtube";
    }
    if (host.endsWith("vimeo.com")) return "vimeo";
    if (host.endsWith("pinterest.com")) return "pinterest";
    if (/\.(mp4|mov|webm|m3u8)(\?|$)/.test(path)) return "video";
    return "web";
  } catch {
    return "web";
  }
}

function isVideoPlatform(p: SourcePlatform): boolean {
  return p === "tiktok" || p === "instagram_reel" || p === "youtube_short" || p === "youtube" || p === "vimeo" || p === "video";
}

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

async function aiCategorize(input: {
  url: string; title: string; description: string; source: string;
  platform: SourcePlatform;
  creator?: string | null;
  caption?: string | null;
  transcript?: string | null;
  notes?: string; contextType?: string;
  existingCollections: string[];
}) {
  const key = process.env.LOVABLE_API_KEY;
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
    input.contextType && `User hint: ${input.contextType}`,
    input.notes && `Notes: ${input.notes}`,
  ].filter(Boolean).join("\n");
  const collectionsHint = input.existingCollections.length
    ? `User's existing collections (prefer one if it fits): ${input.existingCollections.join(", ")}`
    : "User has no existing collections — suggest a short name.";
  const body = {
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: `You categorize saved web/video items for STASHd.
Categories must be one of: ${CATEGORIES.join(", ")}.
Subcategory specific (e.g. "Dinner > Chicken"). Tags: 3-6 lowercase short tags.

CRITICAL ANTI-HALLUCINATION RULES:
- Only use facts present in the provided fields (Title/Caption/Description/Transcript/User hint/Notes/URL). Never invent specific dishes, products, brands, ingredients, locations, or topics that aren't explicitly mentioned.
- If transcript or caption is present, prefer it as the source of truth.
- If the provided content is empty/generic or only a bare video ID with no caption/transcript/hint, DO NOT guess. Use category "Uncategorized", a generic title like "<Platform> video", generic neutral summary, empty arrays for recipe/product/travel fields, and a low confidence_score (<= 0.3).
- generated_title: clean user-facing title (max 90 chars). Prefer the exact provided Title/Caption. Never use placeholder text like "Auto-filled".
- summary: one sentence, max 160 chars, grounded strictly in provided text.
- key_takeaways: 0-5 short bullets (max 120 chars each) ONLY when the content clearly teaches/recommends something.
- recipe_ingredients / recipe_steps: ONLY populate if the content is clearly a recipe. Otherwise empty arrays.
- product_names: ONLY populate if the content recommends specific named products. Otherwise empty array.
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
            generated_title: { type: "string" },
            subcategory: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            summary: { type: "string" },
            notes: { type: "string" },
            suggested_collection: { type: "string" },
            key_takeaways: { type: "array", items: { type: "string" } },
            recipe_ingredients: { type: "array", items: { type: "string" } },
            recipe_steps: { type: "array", items: { type: "string" } },
            product_names: { type: "array", items: { type: "string" } },
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
            "category", "generated_title", "subcategory", "tags",
            "summary", "notes", "suggested_collection",
            "key_takeaways", "recipe_ingredients", "recipe_steps",
            "product_names", "confidence_score",
          ],
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "categorize_item" } },
  };
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

async function embed(text: string): Promise<number[] | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text.slice(0, 8000) }),
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
export async function ingestSharedUrl(input: IngestInput): Promise<IngestResult> {
  if (!input.url) throw new Error("URL is required");
  const parsed = new URL(input.url);
  const platform = detectPlatform(input.url);

  let processingStatus: ProcessingStatus = "pending";

  const incomingTitle = isMeaningfulMetadataValue(input.title, input.url) ? input.title!.trim() : null;
  const incomingDescription = isMeaningfulMetadataValue(input.description) ? input.description!.trim() : null;
  const incomingImage = isMeaningfulMetadataValue(input.image) ? input.image!.trim() : null;
  const userNote = isMeaningfulMetadataValue(input.note) ? input.note!.trim() : "";
  const contextType = isMeaningfulMetadataValue(input.context_type) ? input.context_type!.trim() : "";
  const hasMeta = !!(incomingTitle && incomingDescription && incomingImage);

  let meta: UrlMetadata | null = null;
  if (!hasMeta) {
    try { meta = await fetchMetadata(input.url); } catch (err) { console.warn("Metadata fetch failed", err); }
  }
  if (incomingTitle || incomingDescription || incomingImage || meta?.title || meta?.description) {
    processingStatus = "metadata_found";
  }

  const host = parsed.hostname.replace(/^www\./, "");
  let title = (incomingTitle || meta?.title || bestTitleFromUrl(input.url) || host).slice(0, 500);
  const caption = incomingDescription || meta?.description || null;
  let description = caption || "";
  let image = incomingImage || meta?.image || null;
  const source = input.source || meta?.source || host;
  const creator = creatorFromUrl(input.url, platform);

  // Transcript / caption extraction — runs in parallel with existing metadata path.
  // fetchTranscript is best-effort: YouTube timedtext API, TikTok page scrape,
  // Instagram via Firecrawl. Returns null if nothing useful can be extracted.
  const transcriptResult = await fetchTranscript(input.url, platform);
  const transcript: string | null = transcriptResult?.text ?? null;
  if (transcript) processingStatus = "transcript_found";

  // Existing collection names (for AI hint)
  const { data: cols } = await supabaseAdmin
    .from("collections").select("id,name").eq("user_id", input.userId);
  const existingNames = (cols ?? []).map((c) => c.name);

  // "Needs user context" = video platform with no caption/transcript/note/hint
  const opaqueVideo = isVideoPlatform(platform)
    && !incomingTitle && !caption && !transcript && !userNote && !contextType;

  const ai = input.skip_ai ? null : await aiCategorize({
    url: input.url, title, description, source,
    platform, creator, caption, transcript,
    notes: userNote,
    contextType,
    existingCollections: existingNames,
  });

  const category = ai?.category && (CATEGORIES as readonly string[]).includes(ai.category) ? ai.category : "Uncategorized";
  const cleanArr = (v: any, max = 8, maxLen = 200): string[] =>
    Array.isArray(v)
      ? v.map((t: any) => String(t).replace(/^#/, "").trim()).filter(Boolean).slice(0, max)
         .map((s) => s.slice(0, maxLen))
      : [];
  const tags: string[] = cleanArr(ai?.tags, 8, 60).map((t) => t.toLowerCase());
  const keyTakeaways: string[] = cleanArr(ai?.key_takeaways, 6, 240);
  const recipeIngredients: string[] = cleanArr(ai?.recipe_ingredients, 40, 200);
  const recipeSteps: string[] = cleanArr(ai?.recipe_steps, 30, 600);
  const productNames: string[] = cleanArr(ai?.product_names, 20, 200);
  const travelDetails =
    ai?.travel_details && typeof ai.travel_details === "object" && !Array.isArray(ai.travel_details)
      ? ai.travel_details
      : null;
  const confidence = typeof ai?.confidence_score === "number"
    ? Math.max(0, Math.min(1, ai.confidence_score))
    : null;
  const subcategory = ai?.subcategory ? String(ai.subcategory).slice(0, 200) : null;
  const summary = ai?.summary ? String(ai.summary).slice(0, 240) : null;
  const aiNotes = ai?.notes ? String(ai.notes).trim() : "";
  const aiTitle = ai?.generated_title ? String(ai.generated_title).trim() : "";

  if (!incomingTitle && !meta?.title && aiTitle && isMeaningfulMetadataValue(aiTitle, input.url)) {
    title = aiTitle.slice(0, 500);
  }
  if (!description) description = userNote || aiNotes || summary || "";
  if (!image && meta?.image) image = meta.image;

  if (ai) processingStatus = "ai_processed";
  if (opaqueVideo) processingStatus = "needs_user_context";

  const insertPayload: Record<string, any> = {
    user_id: input.userId,
    collection_id: input.collection_id ?? null,
    title,
    url: input.url,
    description: description || null,
    image_url: image,
    source: source || null,
    type: meta?.type ?? (isVideoPlatform(platform) ? "video" : "link"),
    tags,
    category,
    subcategory,
    ai_summary: summary,
    share_source: input.share_source,
    // New structured fields
    source_platform: platform,
    creator_name: creator,
    original_caption: caption,
    transcript,
    ai_category: ai ? category : null,
    ai_subcategory: subcategory,
    ai_tags: tags,
    ai_key_takeaways: keyTakeaways,
    recipe_ingredients: recipeIngredients,
    recipe_steps: recipeSteps,
    product_names: productNames,
    travel_details: travelDetails,
    confidence_score: confidence,
    processing_status: processingStatus,
  };

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("items")
    .insert(insertPayload)
    .select("id,title,category,subcategory,tags,ai_summary,collection_id,image_url,source,source_platform,processing_status,confidence_score")
    .single();
  if (insErr || !inserted) throw new Error(insErr?.message || "Failed to save item");

  // Embedding (best-effort)
  try {
    let collectionName: string | null = null;
    if (inserted.collection_id) {
      collectionName = cols?.find((c) => c.id === inserted.collection_id)?.name ?? null;
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
    opaqueVideo ? "needs_info" : ai && category !== "Uncategorized" ? "organized" : "uncategorized";

  return {
    item: {
      ...(inserted as any),
      processing_status: processingStatus,
    },
    suggested_collection: ai?.suggested_collection ? String(ai.suggested_collection).slice(0, 80) : null,
    fetched_metadata: !!meta,
    ai_status,
    needs_info: opaqueVideo,
    processing_status: processingStatus,
  };
}

export async function getUserIdFromBearer(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
