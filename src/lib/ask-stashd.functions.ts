import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  isBrowseQuery, detectContentType, detectSubcategory, extractTopicKeywords,
} from "./content-type-utils";

const EMBED_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "gpt-4o-mini";

async function embedQuery(text: string): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type AskMatchItem = {
  id: string;
  title: string;
  url: string | null;
  image_url: string | null;
  source: string | null;
  type: string;
  subcategory: string | null;
  category: string | null;
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
  allItems: AskMatchItem[];
  totalCount: number;
  isBrowse: boolean;
};

// ─── Server Function ──────────────────────────────────────────────────────────

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
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY not configured");

    const isBrowse = isBrowseQuery(data.question);
    const detectedType = detectContentType(data.question);
    const detectedSub = detectSubcategory(data.question, detectedType);
    const topicKeywords = extractTopicKeywords(data.question);

    const filtersApplied: string[] = [];
    if (detectedType) filtersApplied.push(`type=${detectedType}`);
    if (detectedSub) filtersApplied.push(`sub=${detectedSub}`);
    if (topicKeywords.length) filtersApplied.push(`keywords=${topicKeywords.join(",")}`);

    console.log(`[ASK] intent=${isBrowse ? "browse" : "specific"} ${filtersApplied.join(" ") || "no-filters"}`);

    // ── 1a. Embed query ───────────────────────────────────────────────────────
    const { supabase } = context;
    const vec = await embedQuery(data.question);

    // ── 1b. Semantic search (starts in parallel with structured) ──────────────
    const matchCount = isBrowse ? 150 : 30;
    const minSim = isBrowse ? 0.05 : 0.1;

    const semanticPromise = supabase.rpc("search_items_semantic", {
      query_embedding: vec as any,
      match_count: matchCount,
      min_similarity: minSim,
    });

    // ── 1c. Structured keyword search (runs for ALL queries) ──────────────────
    // Searches: tags (exact overlap) + title/subcategory/ai_subcategory/ai_summary (substring)
    // For browse: comprehensive — type + subcategory/keywords
    // For specific: strict — topic keywords filter first, embeddings are fallback only
    let keywordTagIds: string[] = [];
    let keywordTextIds: string[] = [];

    const hasKeywords = topicKeywords.length > 0;
    const hasTypeFilter = !!detectedType;

    if (hasKeywords || hasTypeFilter) {
      // Tag array search (exact keyword overlap in tags / ai_tags)
      const tagSearchPromise = hasKeywords
        ? Promise.all([
            supabaseAdmin.from("items").select("id").eq("user_id", userId)
              .overlaps("tags", topicKeywords).limit(300),
            supabaseAdmin.from("items").select("id").eq("user_id", userId)
              .overlaps("ai_tags", topicKeywords).limit(300),
          ])
        : Promise.resolve([{ data: [] as any[] }, { data: [] as any[] }]);

      // Text field search (title, subcategory, ai_subcategory, ai_summary, category)
      let textQ = supabaseAdmin.from("items").select("id").eq("user_id", userId);
      if (detectedType) textQ = textQ.eq("type", detectedType);

      if (isBrowse) {
        if (detectedSub) {
          textQ = textQ.ilike("subcategory", `%${detectedSub}%`);
        } else if (hasKeywords) {
          const orParts = topicKeywords.flatMap((kw) => [
            `title.ilike.%${kw}%`,
            `ai_summary.ilike.%${kw}%`,
            `subcategory.ilike.%${kw}%`,
            `ai_subcategory.ilike.%${kw}%`,
            `category.ilike.%${kw}%`,
          ]);
          textQ = textQ.or(orParts.join(","));
        }
      } else if (hasKeywords) {
        // Specific query — keyword filter across all relevant text columns
        const orParts = topicKeywords.flatMap((kw) => [
          `title.ilike.%${kw}%`,
          `subcategory.ilike.%${kw}%`,
          `ai_subcategory.ilike.%${kw}%`,
          `ai_summary.ilike.%${kw}%`,
        ]);
        textQ = textQ.or(orParts.join(","));
      }
      // If specific + no keywords but has type filter, the type eq() above is enough

      const [textResult, [tagsResult, aiTagsResult]] = await Promise.all([
        textQ.limit(500),
        tagSearchPromise,
      ]);

      keywordTextIds = textResult.data?.map((r: any) => r.id) ?? [];
      keywordTagIds = [
        ...new Set([
          ...(tagsResult.data?.map((r: any) => r.id) ?? []),
          ...(aiTagsResult.data?.map((r: any) => r.id) ?? []),
        ]),
      ];

      console.log(`[ASK] keyword filter — text: ${keywordTextIds.length} items | tags: ${keywordTagIds.length} items`);
    }

    // tag matches rank highest → text matches next (tags already deduped inside Set)
    const allKeywordIds = [...new Set([...keywordTagIds, ...keywordTextIds])];
    console.log(`[ASK] matched before embeddings: ${allKeywordIds.length}`);

    // ── 1d. Fallback JS cosine if semantic returns nothing ─────────────────────
    const { data: semanticMatches } = await semanticPromise;
    let semanticIds: string[] = Array.isArray(semanticMatches)
      ? semanticMatches.map((m: any) => m.id)
      : [];

    if (semanticIds.length === 0) {
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
        semanticIds = scored.slice(0, matchCount).map((s) => s.id);
      }
    }

    console.log(`[ASK] matched after embeddings (semantic): ${semanticIds.length}`);

    // ── 1e. Merge ─────────────────────────────────────────────────────────────
    // Browse: combine all sources for comprehensive coverage
    // Specific + keyword hits: use keyword results only — avoid polluting context
    //   with semantically-similar-but-wrong items (e.g. makeup tutorials for "dance tutorials")
    // Specific + no keyword hits: fall back to semantic
    let mergedIds: string[];
    if (isBrowse) {
      mergedIds = [...new Set([...allKeywordIds, ...semanticIds])];
    } else if (allKeywordIds.length > 0) {
      mergedIds = allKeywordIds;
    } else {
      mergedIds = semanticIds;
    }

    console.log(`[ASK] merged total: ${mergedIds.length} unique items (strategy=${isBrowse ? "browse-union" : allKeywordIds.length > 0 ? "keyword-strict" : "semantic-fallback"})`);

    if (mergedIds.length === 0) {
      return {
        answer:
          "I couldn't find anything in your STASHd that matches. Try saving more items or rephrasing your question.",
        itemIds: [],
        collectionIds: [],
        items: [],
        collections: [],
        allItems: [],
        totalCount: 0,
        isBrowse,
      };
    }

    // ── 2. Load full item rows ─────────────────────────────────────────────────
    const chunkSize = 100;
    const chunks: string[][] = [];
    for (let i = 0; i < mergedIds.length; i += chunkSize) {
      chunks.push(mergedIds.slice(i, i + chunkSize));
    }
    const chunkResults = await Promise.all(
      chunks.map((chunk) =>
        supabaseAdmin
          .from("items")
          .select("id,user_id,title,url,image_url,source,type,subcategory,ai_subcategory,category,ai_summary,description,tags,ai_tags,collection_id")
          .in("id", chunk)
          .eq("user_id", userId),
      ),
    );
    const itemRows = chunkResults.flatMap((r) => r.data ?? []);

    const itemById = new Map(itemRows.map((r) => [r.id, r]));
    const ordered = mergedIds.map((id) => itemById.get(id)).filter(Boolean) as typeof itemRows;

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

    // ── 3. Build LLM context ───────────────────────────────────────────────────
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

    const MAX_CONTEXT_ITEMS = 200;
    const contextItems = ordered.slice(0, MAX_CONTEXT_ITEMS);

    const contextBlock = contextItems
      .map((it, i) => {
        const opaque = isOpaqueSocial(it);
        if (opaque) {
          return `[${i + 1}] id=${it.id} | title: ${it.title || "(untitled)"} | NOTE: opaque social link — unknown content`;
        }
        const subcat = it.subcategory || it.ai_subcategory || null;
        const hierarchy = it.type
          ? `${it.type}${subcat ? ` > ${subcat}` : ""}`
          : null;
        const allTags = [
          ...(it.tags || []),
          ...(it.ai_tags || []).filter((t: string) => !(it.tags || []).includes(t)),
        ];
        const parts = [
          `[${i + 1}] id=${it.id}`,
          it.title && `title: ${it.title}`,
          hierarchy && `type: ${hierarchy}`,
          allTags.length ? `tags: ${allTags.slice(0, 8).join(", ")}` : null,
          it.collection_id && collectionMap.get(it.collection_id)
            ? `collection: ${collectionMap.get(it.collection_id)}`
            : null,
          it.source && `source: ${it.source}`,
          (!isBrowse || i < 50) && it.ai_summary
            ? `summary: ${it.ai_summary}`
            : null,
          (!isBrowse || i < 50) && it.description
            ? `notes: ${String(it.description).slice(0, 200)}`
            : null,
        ].filter(Boolean);
        return parts.join(" | ");
      })
      .join("\n");

    const totalCount = ordered.length;
    const overflowNote =
      totalCount > MAX_CONTEXT_ITEMS
        ? `\n\n(Showing first ${MAX_CONTEXT_ITEMS} of ${totalCount} total matching items.)`
        : "";

    const keywordMatchCount = allKeywordIds.length;
    const usedKeywordStrategy = !isBrowse && keywordMatchCount > 0;

    const retrievalNote = usedKeywordStrategy
      ? `RETRIEVAL: Found ${keywordMatchCount} item(s) via keyword/tag search (tags, title, subcategory, summary). Items are pre-filtered — do NOT treat them as a general sample.`
      : !isBrowse && keywordMatchCount === 0
        ? `RETRIEVAL: No exact keyword matches found. Results are from semantic similarity search only.`
        : `RETRIEVAL: ${totalCount} item(s) matched via structured + semantic search.`;

    const queryInstruction = isBrowse
      ? `This is a BROWSE/COLLECTION query. The user wants to know about ALL matching items. You MUST:
1. State the exact total count: "${totalCount}" matching items found.
2. Give a helpful summary of the collection (common themes, notable items, variety).
3. In "item_ids", return up to 12 of the MOST interesting/representative items.
4. Keep the answer conversational and useful — tell the user what's in their collection.`
      : usedKeywordStrategy
        ? `This is a SPECIFIC query answered by keyword/tag filtering. You MUST:
1. Open with an exact count: e.g. "I found ${keywordMatchCount} dance tutorial(s) in your STASHd." (replace with the actual topic from the user's question).
2. Briefly describe each matched item (title, type, key detail from summary/tags).
3. If NONE of the items actually match the user's topic, say so plainly — do not stretch.
4. In "item_ids", return the ids of the most relevant items (max 8, in order of relevance).`
        : `This is a SPECIFIC query answered via semantic similarity (no exact keyword matches). Write a short, conversational reply (1-3 sentences) referencing relevant items naturally. In "item_ids", return the ids of items most relevant to the answer (max 8, in order of relevance).`;

    const systemPrompt = `You are "Ask My STASHd", a friendly assistant that ONLY answers using the user's saved STASHd items provided below. Never invent items, links, or facts. Never use general internet knowledge. You CANNOT open URLs or watch videos — only the fields shown below exist.

Rules:
- Use ONLY the fields shown per item: title, type > subcategory, collection, tags, source, summary, notes.
- Items are organized as Type > Subcategory (e.g. Recipe > Dinner, Fashion > Dresses).
- For items marked "NOTE: opaque social link", do NOT guess the topic or content.
- If saved items don't answer the question at all, say so plainly.

${retrievalNote}

${queryInstruction}
In "collection_ids", return ids of relevant collections (max 4).
Always call the answer tool.

USER'S SAVED ITEMS (${totalCount} total matching):
${contextBlock || "(none)"}${overflowNote}

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
                item_ids: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: isBrowse ? 12 : 8,
                  description: isBrowse
                    ? "IDs of the most interesting/representative items (up to 12)"
                    : "IDs of items most relevant to the answer (up to 8)",
                },
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

    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!chatRes.ok) {
      if (chatRes.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
      if (chatRes.status === 402) throw new Error("AI credits exhausted.");
      const txt = await chatRes.text();
      console.error("Ask gateway error", chatRes.status, txt);
      throw new Error("Ask My STASHd failed");
    }
    const json = await chatRes.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;
    if (!argsStr) throw new Error("No answer returned");
    const parsed = JSON.parse(argsStr) as {
      answer: string;
      item_ids: string[];
      collection_ids: string[];
    };

    const maxHighlights = isBrowse ? 12 : 8;
    const filteredItemIds = (parsed.item_ids || []).filter((id) => validItemIds.has(id)).slice(0, maxHighlights);
    const filteredCollectionIds = (parsed.collection_ids || [])
      .filter((id) => validCollectionIds.has(id))
      .slice(0, 4);

    const itemMap = new Map(ordered.map((r) => [r.id, r]));
    const toAskItem = (r: (typeof ordered)[0]): AskMatchItem => ({
      id: r.id,
      title: r.title,
      url: r.url,
      image_url: r.image_url,
      source: r.source,
      type: r.type,
      subcategory: r.subcategory,
      category: r.category,
      ai_summary: r.ai_summary,
      tags: r.tags || [],
      collection_id: r.collection_id,
    });

    const items: AskMatchItem[] = filteredItemIds
      .map((id) => itemMap.get(id))
      .filter((r): r is NonNullable<typeof r> => r != null)
      .map(toAskItem);

    const collections: AskCollection[] = filteredCollectionIds.map((id) => ({
      id,
      name: collectionMap.get(id) || "Collection",
    }));

    const highlightSet = new Set(filteredItemIds);
    const allItems: AskMatchItem[] = ordered
      .filter((r) => r && !highlightSet.has(r.id))
      .map((r) => toAskItem(r!));

    return {
      answer: parsed.answer,
      itemIds: filteredItemIds,
      collectionIds: filteredCollectionIds,
      items,
      collections,
      allItems,
      totalCount,
      isBrowse,
    };
  });
