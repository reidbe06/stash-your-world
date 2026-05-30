// Server-only: shared "ingest a URL → AI categorize → save → embed" pipeline
// used by the Chrome extension, PWA share target, and any future native
// mobile share handlers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bestTitleFromUrl, fetchMetadata, isMeaningfulMetadataValue, type UrlMetadata } from "./url-metadata.server";

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

async function aiCategorize(input: {
  url: string; title: string; description: string; source: string;
  notes?: string; contextType?: string;
  existingCollections: string[];
}) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const content = [
    input.url && `URL: ${input.url}`,
    input.source && `Source: ${input.source}`,
    input.title && `Title: ${input.title}`,
    input.description && `Description: ${input.description}`,
    input.contextType && `User hint: ${input.contextType}`,
    input.notes && `Notes: ${input.notes}`,
  ].filter(Boolean).join("\n");
  const collectionsHint = input.existingCollections.length
    ? `User's existing collections (prefer one if it fits): ${input.existingCollections.join(", ")}`
    : "User has no existing collections — suggest a short name.";
  const body = {
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: `You categorize saved web items for STASHd.
Categories must be one of: ${CATEGORIES.join(", ")}.
Subcategory specific (e.g. "Dinner > Chicken"). Tags: 3-6 lowercase short tags.

CRITICAL ANTI-HALLUCINATION RULES:
- Only use facts present in the provided Title/Description/Source/URL/User hint/Notes. Never invent specific dishes, products, brands, ingredients, or topics that aren't explicitly mentioned.
- User hint and Notes are user-provided facts. Use them to choose category/subcategory/tags, but do not invent details beyond them.
- If the provided content is empty, generic, or only a video/post ID (e.g. a bare TikTok/Instagram URL with no title or description) and there is no user hint or note, DO NOT guess what the content is about. Use category "Uncategorized", a generic title based on the source (e.g. "TikTok video", "Instagram post") and generic tags/notes. Set summary to something neutral like "Saved from <source>".
- generated_title: clean user-facing title (max 90 chars). Prefer the exact provided Title. If only the URL is available and the slug has no human-readable words, fall back to "<Source> <type>" (e.g. "TikTok video"). Never use placeholder text like "Auto-filled".
- Summary: one sentence, max 160 chars, grounded strictly in the provided text.
- notes: helpful concise note (max 220 chars) based ONLY on provided text. If nothing meaningful is provided, leave it as a brief generic note about the source, never a fabricated description.
- suggested_collection: 2-4 words; if unsure, use the source name or category.
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
          },
          required: ["category", "generated_title", "subcategory", "tags", "summary", "notes", "suggested_collection"],
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
  };
  suggested_collection: string | null;
  fetched_metadata: boolean;
  ai_status: "organized" | "needs_info" | "uncategorized";
  needs_info: boolean;
};

/**
 * Ingest a shared URL: optionally fetch metadata, AI-categorize, save, embed.
 * Pass only `{userId, url, share_source}` for fully-automatic mode (mobile share).
 */
export async function ingestSharedUrl(input: IngestInput): Promise<IngestResult> {
  if (!input.url) throw new Error("URL is required");
  const parsed = new URL(input.url);

  const incomingTitle = isMeaningfulMetadataValue(input.title, input.url) ? input.title!.trim() : null;
  const incomingDescription = isMeaningfulMetadataValue(input.description) ? input.description!.trim() : null;
  const incomingImage = isMeaningfulMetadataValue(input.image) ? input.image!.trim() : null;
  const hasMeta = !!(incomingTitle && incomingDescription && incomingImage);
  let meta: UrlMetadata | null = null;
  if (!hasMeta) {
    try { meta = await fetchMetadata(input.url); } catch (err) { console.warn("Metadata fetch failed", err); }
  }

  const host = parsed.hostname.replace(/^www\./, "");
  let title = (incomingTitle || meta?.title || bestTitleFromUrl(input.url) || host).slice(0, 500);
  let description = incomingDescription || meta?.description || "";
  let image = incomingImage || meta?.image || null;
  const source = input.source || meta?.source || host;

  // Existing collection names (for AI hint)
  const { data: cols } = await supabaseAdmin
    .from("collections").select("id,name").eq("user_id", input.userId);
  const existingNames = (cols ?? []).map((c) => c.name);

  const ai = await aiCategorize({
    url: input.url, title, description, source,
    existingCollections: existingNames,
  });

  const category = ai?.category && (CATEGORIES as readonly string[]).includes(ai.category) ? ai.category : null;
  const tags: string[] = Array.isArray(ai?.tags)
    ? ai.tags.map((t: any) => String(t).toLowerCase().replace(/^#/, "").trim()).filter(Boolean).slice(0, 8)
    : [];
  const subcategory = ai?.subcategory ? String(ai.subcategory).slice(0, 200) : null;
  const summary = ai?.summary ? String(ai.summary).slice(0, 240) : null;
  const aiNotes = ai?.notes ? String(ai.notes).trim() : "";
  const aiTitle = ai?.generated_title ? String(ai.generated_title).trim() : "";

  // If we never got a real page title (only host/slug), trust the AI title.
  if (!incomingTitle && !meta?.title && aiTitle && isMeaningfulMetadataValue(aiTitle, input.url)) {
    title = aiTitle.slice(0, 500);
  }
  if (!description) description = aiNotes || summary || "";
  if (!image && meta?.image) image = meta.image;

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("items")
    .insert({
      user_id: input.userId,
      collection_id: input.collection_id ?? null,
      title,
      url: input.url,
      description: description || null,
      image_url: image,
      source: source || null,
      type: meta?.type ?? "link",
      tags,
      category,
      subcategory,
      ai_summary: summary,
      share_source: input.share_source,
    })
    .select("id,title,category,subcategory,tags,ai_summary,collection_id,image_url,source")
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
      inserted.ai_summary && `Summary: ${inserted.ai_summary}`,
      description && `Notes: ${description}`,
      source && `Source: ${source}`,
    ].filter(Boolean).join("\n");
    const vec = await embed(text);
    if (vec) {
      await supabaseAdmin.from("items")
        .update({ embedding: vec as any, embedding_updated_at: new Date().toISOString() })
        .eq("id", inserted.id);
    }
  } catch (err) { console.warn("Embed failed", err); }

  return {
    item: inserted as IngestResult["item"],
    suggested_collection: ai?.suggested_collection ? String(ai.suggested_collection).slice(0, 80) : null,
    fetched_metadata: !!meta,
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
