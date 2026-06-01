import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CATEGORIES, CONTENT_TYPES, MEDIA_FORMATS, SUBCATEGORY_TAXONOMY } from "./taxonomy";

export { CATEGORIES, CONTENT_TYPES, MEDIA_FORMATS, SUBCATEGORY_TAXONOMY };

const SUBCATEGORY_HINT = Object.entries(SUBCATEGORY_TAXONOMY)
  .map(([type, subs]) => `  ${type}: ${subs.join(", ")}`)
  .join("\n");

export type AiCategorization = {
  generated_title: string;
  category: string;
  content_type: string;
  media_format: string;
  subcategory: string;
  tags: string[];
  summary: string;
  notes: string;
  suggested_collection: string;
  suggested_collections: string[];
};

const inputSchema = z.object({
  url: z.string().max(2000).optional().default(""),
  title: z.string().max(500).optional().default(""),
  description: z.string().max(2000).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
  contextType: z.string().max(80).optional().default(""),
  source: z.string().max(200).optional().default(""),
  existingCollections: z.array(z.string().max(200)).max(50).optional().default([]),
});

export const categorizeItem = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<AiCategorization> => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY not configured");

    const content = [
      data.url && `URL: ${data.url}`,
      data.source && `Source: ${data.source}`,
      data.title && `Title: ${data.title}`,
      data.description && `Description: ${data.description}`,
      data.contextType && `User hint: ${data.contextType}`,
      data.notes && `Notes: ${data.notes}`,
    ]
      .filter(Boolean)
      .join("\n");

    const collectionsHint = data.existingCollections.length
      ? `User's existing collections (prefer one of these if it fits, otherwise suggest a new short name): ${data.existingCollections.join(", ")}`
      : "User has no existing collections — suggest a short collection name.";

    const systemPrompt = `You categorize saved web items for STASHd, a personal organization app.
Always respond by calling the categorize_item tool. Be concise and specific.

content_type is the PURPOSE of the content (what it's ABOUT), not the media format:
- A recipe video → "Recipe"
- A fashion TikTok → "Fashion"
- A product page → "Product"
- A YouTube tutorial → "Tutorial"
content_type must be exactly one of: ${CONTENT_TYPES.join(", ")}.

subcategory must be one value from this taxonomy for the chosen content_type:
${SUBCATEGORY_HINT}
If none fit perfectly, pick the closest. For Recipe, default to "Dinner" when unclear.

Tags: 3-6 lowercase short tags, no '#'.

CRITICAL ANTI-HALLUCINATION RULES:
- Only use facts that appear in the provided Title/Description/Source/URL. Never invent specific dishes, products, brands, ingredients, or topics not explicitly present.
- If content is empty or only an opaque video/post ID with no title/description/hint, use category "Uncategorized", a generic title, generic tags, and neutral note.
- generated_title: clean user-facing title, max 90 chars.
- summary: one sentence, max 160 chars, grounded strictly in provided text.
- notes: concise note, max 220 chars, based only on provided text.
- suggested_collection: single best short title (2-4 words) for organizing this item.
- suggested_collections: 3 short collection names (2-4 words each), first matching suggested_collection.
${collectionsHint}`;

    const body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: content || "No content provided. Use the URL only." },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "categorize_item",
            description: "Return structured categorization for the saved item.",
            parameters: {
              type: "object",
              properties: {
                category: { type: "string", enum: [...CATEGORIES] },
                content_type: { type: "string", enum: [...CONTENT_TYPES], description: "Content purpose — what is this about? NOT the media format." },
                media_format: { type: "string", enum: [...MEDIA_FORMATS], description: "Technical delivery format." },
                generated_title: { type: "string" },
                subcategory: { type: "string", description: "One value from the subcategory taxonomy for the chosen content_type." },
                tags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
                summary: { type: "string" },
                notes: { type: "string" },
                suggested_collection: { type: "string" },
                suggested_collections: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
              },
              required: ["category", "content_type", "media_format", "generated_title", "subcategory", "tags", "summary", "notes", "suggested_collection", "suggested_collections"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "categorize_item" } },
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("OpenAI rate limit reached. Try again in a moment.");
      if (res.status === 401) throw new Error("OpenAI API key is invalid. Check your OPENAI_API_KEY secret.");
      if (res.status === 402) throw new Error("OpenAI credits exhausted. Add credits at platform.openai.com.");
      const txt = await res.text();
      console.error("AI gateway error", res.status, txt);
      throw new Error("AI categorization failed");
    }

    const json = await res.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;
    if (!argsStr) throw new Error("AI returned no categorization");
    const parsed = JSON.parse(argsStr) as AiCategorization;

    const category = (CATEGORIES as readonly string[]).includes(parsed.category)
      ? parsed.category
      : "Other";

    const suggestedCollection = (parsed.suggested_collection || "").slice(0, 80);
    const suggestedCollections = Array.isArray(parsed.suggested_collections)
      ? parsed.suggested_collections.map((s) => String(s).trim().slice(0, 80)).filter(Boolean)
      : [];
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const name of [suggestedCollection, ...suggestedCollections]) {
      const k = name.toLowerCase();
      if (!name || seen.has(k)) continue;
      seen.add(k);
      merged.push(name);
      if (merged.length >= 5) break;
    }

    const contentType = (CONTENT_TYPES as readonly string[]).includes(parsed.content_type)
      ? parsed.content_type
      : "Other";
    const mediaFormat = (MEDIA_FORMATS as readonly string[]).includes(parsed.media_format)
      ? parsed.media_format
      : "Webpage";

    return {
      generated_title: (parsed.generated_title || parsed.summary || data.title || "Saved link").slice(0, 120),
      category,
      content_type: contentType,
      media_format: mediaFormat,
      subcategory: (parsed.subcategory || "").slice(0, 200),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t) => String(t).toLowerCase().replace(/^#/, "").trim()).filter(Boolean).slice(0, 8)
        : [],
      summary: (parsed.summary || "").slice(0, 240),
      notes: (parsed.notes || parsed.summary || "").slice(0, 500),
      suggested_collection: suggestedCollection,
      suggested_collections: merged,
    };
  });
