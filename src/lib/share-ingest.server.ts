// Server-only: shared "ingest a URL → AI categorize → save → embed" pipeline
// used by the Chrome extension, PWA share target, and any future native
// mobile share handlers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bestTitleFromUrl, fetchMetadata, isMeaningfulMetadataValue, type UrlMetadata } from "./url-metadata.server";
import { fetchTranscript } from "./transcript.server";
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

CRITICAL ANTI-HALLUCINATION RULES:
- Only use facts present in the provided fields (Title/Caption/Description/Transcript/User hint/Notes/URL). Never invent specific dishes, products, brands, ingredients, locations, or topics that aren't explicitly mentioned.
- If transcript or caption is present, prefer it as the source of truth.
- If the provided content is empty/generic or only a bare video ID with no caption/transcript/hint, DO NOT guess. Use category "Uncategorized", content_type "Other", a generic title like "<Platform> video", generic neutral summary, empty arrays for recipe/product/travel fields, and a low confidence_score (<= 0.3).
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
            "category", "content_type", "media_format", "generated_title", "subcategory", "tags",
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

  console.log(`[INGEST] ── START ──────────────────────────────────────`);
  console.log(`[INGEST] URL:      ${input.url}`);
  console.log(`[INGEST] Platform: ${platform}`);
  console.log(`[INGEST] Source:   ${input.share_source}`);

  let processingStatus: ProcessingStatus = "pending";

  const incomingTitle = isMeaningfulMetadataValue(input.title, input.url) ? input.title!.trim() : null;
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
  let image = incomingImage || meta?.image || null;
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

    // Thumbnail: prefer incoming → meta → yt-dlp
    if (!image && ytEnrich.thumbnail) {
      image = ytEnrich.thumbnail;
      console.log(`[INGEST] thumbnail set from yt-dlp`);
    }
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
  let productNames: string[];
  let travelDetails: any;
  let confidence: number | null;
  let subcategory: string | null;
  let summary: string | null;
  let suggestedCollection: string | null = null;

  if (opaqueVideo) {
    // No real content to analyse — skip AI entirely to avoid hallucinated generic output.
    // Save a stub that tells the UI the item needs the user to add context.
    console.log(`[INGEST] Skipping AI — no extractable content for ${platform}`);
    category = "Needs Review";
    contentType = "Other";
    mediaFormat = platformToMediaFormat(platform);
    tags = [platform.replace(/_/g, "-")];
    keyTakeaways = [];
    recipeIngredients = [];
    recipeSteps = [];
    productNames = [];
    travelDetails = null;
    confidence = null;
    subcategory = null;
    summary = `STASHd could not extract enough content from this ${platformDefault ?? "video"} to categorize it automatically.`;
    processingStatus = "needs_user_context";
  } else {
    // We have at least some content — call OpenAI.
    // Hashtags from yt-dlp (YouTube tags) or Apify (Instagram/TikTok hashtags)
    const enrichHashtags = ytEnrich?.tags?.length ? ytEnrich.tags.slice(0, 10) : [];
    const aiInput = {
      url: input.url, title, description, source,
      platform, creator, caption, transcript,
      hashtags: enrichHashtags.length ? enrichHashtags : undefined,
      notes: userNote,
      contextType,
      existingCollections: existingNames,
    };
    const aiPromptText = [
      `URL: ${input.url}`,
      `Platform: ${platform}`,
      creator && `Creator: ${creator}`,
      caption && `Caption: ${caption.slice(0, 300)}`,
      transcript && `Transcript (first 400): ${transcript.slice(0, 400)}`,
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
    productNames = cleanArr(ai?.product_names, 20, 200);
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

  console.log(`[INGEST] Final: title=${JSON.stringify(title)} category=${category} status=${processingStatus} image=${!!image}`);

  const insertPayload: Record<string, any> = {
    user_id: input.userId,
    collection_id: input.collection_id ?? null,
    title,
    url: input.url,
    description: description || null,
    image_url: image,
    source: source || null,
    type: contentType,
    media_format: mediaFormat,
    tags,
    category,
    subcategory,
    ai_summary: summary,
    share_source: input.share_source,
    // New structured fields
    source_platform: platform,
    creator_name: creator,
    // For Instagram/TikTok, Apify caption goes into original_caption (it IS the post caption)
    original_caption: caption ?? (
      (platform === "instagram_reel" || platform === "instagram" || platform === "tiktok") && transcript
        ? transcript
        : null
    ),
    transcript,
    ai_category: opaqueVideo ? null : category,
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
    opaqueVideo ? "needs_info" : category !== "Uncategorized" ? "organized" : "uncategorized";

  return {
    item: {
      ...(inserted as any),
      processing_status: processingStatus,
    },
    suggested_collection: suggestedCollection,
    fetched_metadata: !!meta,
    ai_status,
    needs_info: opaqueVideo,
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
  product_names: string[];
  confidence_score: number | null;
  processing_status: string;
};

export async function recategorizeItem(input: RecategorizeInput): Promise<RecategorizeResult> {
  const { userId, itemId, note } = input;
  const trimmedNote = note.trim();
  if (!trimmedNote) throw new Error("Note is required");

  // Fetch the existing item (server-side, admin client)
  const { data: item, error: fetchErr } = await supabaseAdmin
    .from("items")
    .select("id,url,title,source,source_platform,creator_name,original_caption,transcript,image_url,collection_id,user_id")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single();

  if (fetchErr || !item) throw new Error(fetchErr?.message || "Item not found");

  const platform = (item.source_platform ?? "web") as SourcePlatform;

  // Existing collections for the suggested_collection hint
  const { data: cols } = await supabaseAdmin
    .from("collections").select("id,name").eq("user_id", userId);
  const existingNames = (cols ?? []).map((c) => c.name);

  const cleanArr = (v: any, max = 8, maxLen = 200): string[] =>
    Array.isArray(v)
      ? v.map((t: any) => String(t).replace(/^#/, "").trim()).filter(Boolean).slice(0, max)
         .map((s: string) => s.slice(0, maxLen))
      : [];

  console.log(`[RECATEGORIZE] item=${itemId} platform=${platform} note=${JSON.stringify(trimmedNote.slice(0, 120))}`);

  const ai = await aiCategorize({
    url: item.url ?? "",
    title: item.title ?? "",
    description: "",
    source: item.source ?? "",
    platform,
    creator: item.creator_name ?? null,
    caption: item.original_caption ?? null,
    transcript: item.transcript ?? null,
    notes: trimmedNote,
    existingCollections: existingNames,
  });

  console.log(`[RECATEGORIZE] OpenAI response: category=${ai?.category} title=${JSON.stringify(ai?.generated_title)} confidence=${ai?.confidence_score}`);

  const CATS = CATEGORIES as readonly string[];
  const category = ai?.category && CATS.includes(ai.category) ? ai.category : "Uncategorized";
  const tags = cleanArr(ai?.tags, 8, 60).map((t: string) => t.toLowerCase());
  const keyTakeaways = cleanArr(ai?.key_takeaways, 6, 240);
  const recipeIngredients = cleanArr(ai?.recipe_ingredients, 40, 200);
  const recipeSteps = cleanArr(ai?.recipe_steps, 30, 600);
  const productNames = cleanArr(ai?.product_names, 20, 200);
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

  // Build update payload
  const updatePayload: Record<string, any> = {
    type: recategorizeContentType,
    category,
    subcategory,
    tags,
    ai_summary: summary,
    ai_category: category,
    ai_subcategory: subcategory,
    ai_tags: tags,
    ai_key_takeaways: keyTakeaways,
    recipe_ingredients: recipeIngredients,
    recipe_steps: recipeSteps,
    product_names: productNames,
    travel_details: travelDetails,
    confidence_score: confidence,
    processing_status: "ai_processed",
    // Store the user's note in description so it's visible
    description: trimmedNote,
  };

  if (aiTitle && isMeaningfulMetadataValue(aiTitle, item.url ?? "")) {
    updatePayload.title = aiTitle.slice(0, 500);
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from("items")
    .update(updatePayload as any)
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("id,title,category,subcategory,tags,ai_summary,ai_category,ai_subcategory,ai_tags,ai_key_takeaways,recipe_ingredients,recipe_steps,product_names,confidence_score,processing_status")
    .single();

  if (updErr || !updated) throw new Error(updErr?.message || "Failed to update item");

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
