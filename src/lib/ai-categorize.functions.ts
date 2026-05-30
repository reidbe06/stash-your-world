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
  category: string;
  subcategory: string;
  tags: string[];
  summary: string;
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
Summary: one sentence, max 160 chars.
Suggested collection: a short title (2-4 words).
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
                subcategory: { type: "string" },
                tags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
                summary: { type: "string" },
                suggested_collection: { type: "string" },
              },
              required: ["category", "subcategory", "tags", "summary", "suggested_collection"],
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

    return {
      category,
      subcategory: (parsed.subcategory || "").slice(0, 200),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t) => String(t).toLowerCase().replace(/^#/, "").trim()).filter(Boolean).slice(0, 8)
        : [],
      summary: (parsed.summary || "").slice(0, 240),
      suggested_collection: (parsed.suggested_collection || "").slice(0, 80),
    };
  });
