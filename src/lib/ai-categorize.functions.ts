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
  "Other",
] as const;

export type AiCategorization = {
  generated_title: string;
  category: string;
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
  source: z.string().max(200).optional().default(""),
  existingCollections: z.array(z.string().max(200)).max(50).optional().default([]),
});

export const categorizeItem = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<AiCategorization> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const content = [
      data.url && `URL: ${data.url}`,
      data.source && `Source: ${data.source}`,
      data.title && `Title: ${data.title}`,
      data.description && `Description: ${data.description}`,
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
generated_title: a clean user-facing item title, max 90 chars. Prefer the actual product/post/article/recipe title; if metadata is missing, infer from the URL slug without saying "Auto-filled".
Summary: one sentence, max 160 chars.
notes: one useful concise note for the saved item, max 220 chars. Never return placeholder text.
suggested_collection: the single best short title (2-4 words) for organizing this item.
suggested_collections: 3 short collection names (2-4 words each) the user could file this under. Prefer reusing the user's existing collections when they fit; otherwise propose new ones. Examples — Recipes: "Dinner Ideas", "Healthy Meals", "Chicken Recipes". Fashion: "Summer Outfits", "Work Clothes", "Date Night Looks". Home: "Living Room Ideas", "Kitchen Remodel", "Organization". Order from best fit to alternative. The first entry should match suggested_collection.
${collectionsHint}`;

    const body = {
      model: "google/gemini-3-flash-preview",
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
                generated_title: { type: "string" },
                subcategory: { type: "string" },
                tags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
                summary: { type: "string" },
                notes: { type: "string" },
                suggested_collection: { type: "string" },
                suggested_collections: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
              },
              required: ["category", "generated_title", "subcategory", "tags", "summary", "notes", "suggested_collection", "suggested_collections"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "categorize_item" } },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
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

    return {
      generated_title: (parsed.generated_title || parsed.summary || data.title || "Saved link").slice(0, 120),
      category,
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
