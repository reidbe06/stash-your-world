import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const EMBED_MODEL = "openai/text-embedding-3-small";
const CHAT_MODEL = "google/gemini-3-flash-preview";

async function embedQuery(text: string): Promise<number[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 8000) }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    throw new Error("Embedding failed");
  }
  const json = await res.json();
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("No embedding returned");
  return vec;
}

export type AskMatchItem = {
  id: string;
  title: string;
  url: string | null;
  image_url: string | null;
  source: string | null;
  type: string;
  category: string | null;
  subcategory: string | null;
  ai_summary: string | null;
  tags: string[];
  collection_id: string | null;
};

export type AskCollection = { id: string; name: string };

export type AskResult = {
  answer: string;
  itemIds: string[];
  collectionIds: string[];
  items: AskMatchItem[];
  collections: AskCollection[];
};

export const askStashd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      question: z.string().trim().min(1).max(500),
      history: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().max(4000),
          }),
        )
        .max(20)
        .optional()
        .default([]),
    }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AskResult> => {
    const { userId } = context;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    // 1) Semantic search restricted to this user (use the user-scoped client so RLS + auth.uid() apply)
    const { supabase } = context;
    const vec = await embedQuery(data.question);
    const { data: matches } = await supabase.rpc("search_items_semantic", {
      query_embedding: vec as any,
      match_count: 20,
      min_similarity: 0.1,
    });
    let matchIds: string[] = Array.isArray(matches) ? matches.map((m: any) => m.id) : [];
    if (matchIds.length === 0) {
      // Fallback: cosine in JS over the user's items (handles missing/old embeddings)
      const { data: rows } = await supabaseAdmin
        .from("items")
        .select("id, embedding")
        .eq("user_id", userId)
        .not("embedding", "is", null)
        .limit(500);
      if (rows?.length) {
        const scored = rows
          .map((r: any) => {
            const e: number[] | null = r.embedding as any;
            if (!Array.isArray(e) || e.length !== vec.length) return null;
            let dot = 0, na = 0, nb = 0;
            for (let i = 0; i < e.length; i++) {
              dot += e[i] * vec[i];
              na += e[i] * e[i];
              nb += vec[i] * vec[i];
            }
            const sim = dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
            return { id: r.id as string, sim };
          })
          .filter(Boolean) as { id: string; sim: number }[];
        scored.sort((a, b) => b.sim - a.sim);
        matchIds = scored.slice(0, 20).map((s) => s.id);
      }
    }

    if (matchIds.length === 0) {
      return {
        answer:
          "I couldn't find anything in your STASHd that matches. Try saving more items or rephrasing your question.",
        itemIds: [],
        collectionIds: [],
        items: [],
        collections: [],
      };
    }

    // 2) Load full item rows + collections
    const { data: itemRows, error: itemsErr } = await supabaseAdmin
      .from("items")
      .select(
        "id,user_id,title,url,image_url,source,type,category,subcategory,ai_summary,description,tags,collection_id",
      )
      .in("id", matchIds)
      .eq("user_id", userId);
    if (itemsErr) throw new Error(itemsErr.message);

    const ordered = matchIds
      .map((id) => itemRows?.find((r) => r.id === id))
      .filter(Boolean) as NonNullable<typeof itemRows>;

    const collectionIds = Array.from(
      new Set(ordered.map((r) => r.collection_id).filter(Boolean) as string[]),
    );
    const collectionMap = new Map<string, string>();
    if (collectionIds.length) {
      const { data: cols } = await supabaseAdmin
        .from("collections")
        .select("id,name")
        .in("id", collectionIds)
        .eq("user_id", userId);
      cols?.forEach((c) => collectionMap.set(c.id, c.name));
    }

    // 3) Build LLM context (numbered list so model can cite by index)
    const isOpaqueSocial = (it: any) => {
      const url = String(it.url || "").toLowerCase();
      const social = /(tiktok\.com|instagram\.com|\/reel\/|\/reels\/)/.test(url);
      const hasUserContext =
        (it.description && String(it.description).trim().length > 0) ||
        (it.category && it.category !== "Uncategorized") ||
        (it.tags && it.tags.length > 0) ||
        (it.ai_summary && String(it.ai_summary).trim().length > 0);
      return social && !hasUserContext;
    };

    const contextBlock = ordered
      .map((it, i) => {
        const opaque = isOpaqueSocial(it);
        const parts = [
          `[${i + 1}] id=${it.id}`,
          it.title && `title: ${it.title}`,
          it.category && `category: ${it.category}${it.subcategory ? ` > ${it.subcategory}` : ""}`,
          it.collection_id && collectionMap.get(it.collection_id)
            ? `collection: ${collectionMap.get(it.collection_id)}`
            : null,
          it.tags?.length ? `tags: ${it.tags.join(", ")}` : null,
          it.source && `source: ${it.source}`,
          it.type && `type: ${it.type}`,
          it.ai_summary && `summary: ${it.ai_summary}`,
          it.description && `notes: ${String(it.description).slice(0, 300)}`,
          it.url && `url: ${it.url}`,
          opaque ? `NOTE: opaque social link — no readable content. Do NOT guess what it is about.` : null,
        ].filter(Boolean);
        return parts.join(" | ");
      })
      .join("\n");

    const systemPrompt = `You are "Ask My STASHd", a friendly assistant that ONLY answers using the user's saved STASHd items provided below. Never invent items, links, or facts. Never use general internet knowledge. You CANNOT open URLs or watch videos — only the fields shown below exist.

Rules:
- Use ONLY these fields per item: title, category/subcategory, collection, tags, source, type, ai_summary, notes (user description), url.
- For items marked "NOTE: opaque social link" (TikTok / Instagram / Reels with no notes, tags, or non-Uncategorized category), do NOT guess the topic, recipe, product, or content. Treat them as unknown.
- If the user asks about an opaque social item, or if relevant items lack the detail needed to answer, say exactly: "I saved this link, but I need a note or category to understand it better." Then briefly suggest they add a note, tag, or category to that item.
- If saved items don't answer the question at all, say so plainly and suggest what they could save next.

Always call the answer tool. In "answer", write a short, conversational reply (1-3 sentences) referencing relevant items naturally. In "item_ids", return the ids of the items most relevant to the answer (max 8, in order of relevance). In "collection_ids", return ids of collections worth surfacing (max 4). Do not include items unrelated to the question.

USER'S SAVED ITEMS:
${contextBlock || "(none)"}

COLLECTIONS:
${collectionIds.length ? collectionIds.map((id) => `${id} = ${collectionMap.get(id)}`).join("\n") : "(none)"}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...data.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: data.question },
    ];

    const validItemIds = new Set(ordered.map((o) => o.id));
    const validCollectionIds = new Set(collectionIds);

    const body = {
      model: CHAT_MODEL,
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: "answer",
            description: "Reply to the user using only their saved items.",
            parameters: {
              type: "object",
              properties: {
                answer: { type: "string" },
                item_ids: { type: "array", items: { type: "string" }, maxItems: 8 },
                collection_ids: { type: "array", items: { type: "string" }, maxItems: 4 },
              },
              required: ["answer", "item_ids", "collection_ids"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "answer" } },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      const txt = await res.text();
      console.error("Ask gateway error", res.status, txt);
      throw new Error("Ask My STASHd failed");
    }
    const json = await res.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;
    if (!argsStr) throw new Error("No answer returned");
    const parsed = JSON.parse(argsStr) as {
      answer: string;
      item_ids: string[];
      collection_ids: string[];
    };

    const filteredItemIds = (parsed.item_ids || []).filter((id) => validItemIds.has(id)).slice(0, 8);
    const filteredCollectionIds = (parsed.collection_ids || [])
      .filter((id) => validCollectionIds.has(id))
      .slice(0, 4);

    const itemMap = new Map(ordered.map((r) => [r.id, r]));
    const items: AskMatchItem[] = filteredItemIds
      .map((id) => itemMap.get(id))
      .filter(Boolean)
      .map((r) => ({
        id: r!.id,
        title: r!.title,
        url: r!.url,
        image_url: r!.image_url,
        source: r!.source,
        type: r!.type,
        category: r!.category,
        subcategory: r!.subcategory,
        ai_summary: r!.ai_summary,
        tags: r!.tags || [],
        collection_id: r!.collection_id,
      }));

    const collections: AskCollection[] = filteredCollectionIds.map((id) => ({
      id,
      name: collectionMap.get(id) || "Collection",
    }));

    return {
      answer: parsed.answer,
      itemIds: filteredItemIds,
      collectionIds: filteredCollectionIds,
      items,
      collections,
    };
  });
