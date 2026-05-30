import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const EMBED_MODEL = "text-embedding-3-small"; // 1536 dims

async function embedText(text: string): Promise<number[]> {
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
    const t = await res.text();
    console.error("Embedding error", res.status, t);
    throw new Error("Embedding failed");
  }
  const json = await res.json();
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("No embedding returned");
  return vec;
}

type ItemRow = {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  ai_summary: string | null;
  tags: string[] | null;
  category: string | null;
  subcategory: string | null;
  source: string | null;
  type: string | null;
  collection_id: string | null;
};

function buildItemText(it: ItemRow, collectionName?: string | null): string {
  const parts = [
    it.title && `Title: ${it.title}`,
    it.category && `Category: ${it.category}`,
    it.subcategory && `Subcategory: ${it.subcategory}`,
    collectionName && `Collection: ${collectionName}`,
    it.tags?.length && `Tags: ${it.tags.join(", ")}`,
    it.ai_summary && `Summary: ${it.ai_summary}`,
    it.description && `Notes: ${it.description}`,
    it.source && `Source: ${it.source}`,
    it.type && `Type: ${it.type}`,
  ].filter(Boolean);
  return parts.join("\n");
}

// Embed a single item (admin) — used on save/update
export const embedItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ itemId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: item, error } = await supabaseAdmin
      .from("items")
      .select("id,user_id,title,description,ai_summary,tags,category,subcategory,source,type,collection_id")
      .eq("id", data.itemId)
      .single();
    if (error || !item) throw new Error(error?.message || "Item not found");
    if (item.user_id !== userId) throw new Error("Not allowed");

    let collectionName: string | null = null;
    if (item.collection_id) {
      const { data: c } = await supabaseAdmin
        .from("collections")
        .select("name")
        .eq("id", item.collection_id)
        .maybeSingle();
      collectionName = c?.name ?? null;
    }
    const text = buildItemText(item as ItemRow, collectionName);
    if (!text.trim()) return { ok: true, skipped: true };

    const vec = await embedText(text);
    const { error: updErr } = await supabaseAdmin
      .from("items")
      .update({ embedding: vec as any, embedding_updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true };
  });

// Backfill missing embeddings for the current user (bounded per call)
export const backfillUserEmbeddings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ limit: z.number().int().min(1).max(50).optional().default(20) }).parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: rows, error } = await supabaseAdmin
      .from("items")
      .select("id,user_id,title,description,ai_summary,tags,category,subcategory,source,type,collection_id")
      .eq("user_id", userId)
      .is("embedding", null)
      .limit(data.limit);
    if (error) throw new Error(error.message);
    if (!rows?.length) return { processed: 0 };

    // Pre-fetch needed collection names
    const collectionIds = Array.from(new Set(rows.map((r) => r.collection_id).filter(Boolean) as string[]));
    const nameMap = new Map<string, string>();
    if (collectionIds.length) {
      const { data: cols } = await supabaseAdmin
        .from("collections")
        .select("id,name")
        .in("id", collectionIds);
      cols?.forEach((c) => nameMap.set(c.id, c.name));
    }

    let processed = 0;
    for (const it of rows as ItemRow[]) {
      try {
        const text = buildItemText(it, it.collection_id ? nameMap.get(it.collection_id) ?? null : null);
        if (!text.trim()) continue;
        const vec = await embedText(text);
        await supabaseAdmin
          .from("items")
          .update({ embedding: vec as any, embedding_updated_at: new Date().toISOString() })
          .eq("id", it.id);
        processed++;
      } catch (err) {
        console.warn("Backfill embed failed for", it.id, err);
      }
    }
    return { processed, remaining: Math.max(0, rows.length - processed) };
  });

// Semantic search — embeds query, calls RPC scoped to current user via RLS
export const semanticSearchItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      query: z.string().trim().min(1).max(500),
      limit: z.number().int().min(1).max(50).optional().default(30),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const vec = await embedText(data.query);
    const { data: matches, error } = await supabase.rpc("search_items_semantic", {
      query_embedding: vec as any,
      match_count: data.limit,
      min_similarity: 0.1,
    });
    if (error) throw new Error(error.message);
    return { matches: (matches ?? []) as Array<{ id: string; similarity: number }> };
  });
