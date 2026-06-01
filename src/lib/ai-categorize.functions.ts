import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const CATEGORIES = [
  "Products",
  "Fashion",
  "Beauty",
  "Home",
  "Recipes",
  "Travel",
  "Fitness",
  "Parenting",
  "Business Ideas",
  "Shopping Deals",
  "Entertainment",
  "Videos",
  "Education",
  "Needs Review",
  "Uncategorized",
  "Other",
] as const;

export const CONTENT_TYPES = [
  "Recipe", "Product", "Fashion / Outfit", "Home Idea", "Travel Idea",
  "Tutorial", "Fitness / Workout", "Beauty", "Parenting", "Business Idea",
  "Entertainment", "Other",
] as const;

export const MEDIA_FORMATS = [
  "Video", "Article", "Webpage", "Social Post", "Product Page", "Image",
] as const;

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

    const systemPrompt = `You categorize saved web items for STASHd, a social organization app.
Always respond by calling the categorize_item tool. Be concise and specific.
Categories must be exactly one of: ${CATEGORIES.join(", ")}.
Subcategory should be specific (e.g. "Dinner > Chicken", "Women's Clothing > Casual", "Home Decor", "Strength Training").
Tags: 3-6 lowercase short tags, no '#'.

CRITICAL ANTI-HALLUCINATION RULES:
- Only use facts that appear in the provided Title/Description/Source/URL. Never invent specific dishes, products, brands, ingredients, recipes, or topics that are not explicitly present.
- User hint and Notes are user-provided facts. Use them to choose category/subcategory/tags, but do not invent details beyond them.
- If the provided content is empty, generic, or only an opaque video/post ID (e.g. a bare TikTok or Instagram URL with no readable title/description) and there is no user hint or note, DO NOT guess what the content is about. Use category "Uncategorized", a generic title based on the source (e.g. "TikTok video", "Instagram post"), generic tags, and a neutral note. Better to be vague than wrong.
- generated_title: clean user-facing item title, max 90 chars. Prefer the exact provided title. If only an opaque URL is available, fall back to "<Source> <type>" (e.g. "TikTok video"). Never say "Auto-filled".
- Summary: one sentence, max 160 chars, grounded strictly in the provided text.
- notes: one concise note (max 220 chars) grounded ONLY in the provided text. If nothing meaningful is provided, write a brief generic note about the source rather than fabricating details.
- suggested_collection: single best short title (2-4 words) for organizing this item.
- suggested_collections: 3 short collection names (2-4 words each). Prefer reusing the user's existing collections when they fit. Order from best fit to alternative. The first entry should match suggested_collection.
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
                content_type: { type: "string", enum: [...CONTENT_TYPES], description: "Content purpose — what is this about? (Recipe, Product, Tutorial, etc.) NOT the media format." },
                media_format: { type: "string", enum: [...MEDIA_FORMATS], description: "Technical delivery format (Video, Article, Webpage, Social Post, Product Page, Image)." },
                generated_title: { type: "string" },
                subcategory: { type: "string" },
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
    // Ensure top suggestion is in the list, dedupe (case-insensitive)
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
