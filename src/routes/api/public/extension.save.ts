import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const CATEGORIES = [
  "Products", "Fashion", "Beauty", "Home", "Recipes", "Travel", "Fitness",
  "Parenting", "Business Ideas", "Shopping Deals", "Entertainment",
  "Videos", "Education", "Other",
] as const;

const InputSchema = z.object({
  url: z.string().trim().min(1).max(2000).url(),
  title: z.string().trim().max(500).optional().default(""),
  description: z.string().trim().max(2000).optional().default(""),
  image: z.string().trim().max(2000).optional().nullable().default(null),
  source: z.string().trim().max(200).optional().default(""),
  collection_id: z.string().uuid().nullable().optional().default(null),
});

async function getUserId(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

async function categorize(input: {
  url: string; title: string; description: string; source: string;
  existingCollections: string[];
}) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const content = [
    input.url && `URL: ${input.url}`,
    input.source && `Source: ${input.source}`,
    input.title && `Title: ${input.title}`,
    input.description && `Description: ${input.description}`,
  ].filter(Boolean).join("\n");

  const collectionsHint = input.existingCollections.length
    ? `User's existing collections (prefer one if it fits): ${input.existingCollections.join(", ")}`
    : "User has no existing collections — suggest a short name.";

  const body = {
    model: "google/gemini-3-flash-preview",
    messages: [
      {
        role: "system",
        content: `You categorize saved web items for STASHd.
Categories must be one of: ${CATEGORIES.join(", ")}.
Subcategory specific (e.g. "Dinner > Chicken"). Tags: 3-6 lowercase short tags.
Summary: one sentence, max 160 chars. suggested_collection: 2-4 words.
${collectionsHint}`,
      },
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
            subcategory: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            summary: { type: "string" },
            suggested_collection: { type: "string" },
          },
          required: ["category", "subcategory", "tags", "summary", "suggested_collection"],
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "categorize_item" } },
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI ${res.status}`);
  const json = await res.json();
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("No categorization");
  return JSON.parse(args);
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
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/extension/save")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const userId = await getUserId(request);
        if (!userId) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        let payload: z.infer<typeof InputSchema>;
        try {
          const raw = await request.json();
          payload = InputSchema.parse(raw);
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message || "Invalid input" }), {
            status: 400, headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        // Fetch existing collection names for AI hint
        const { data: cols } = await supabaseAdmin
          .from("collections").select("id,name").eq("user_id", userId);
        const existingNames = (cols ?? []).map((c) => c.name);

        // Default title from URL host if missing
        let title = payload.title;
        const host = (() => { try { return new URL(payload.url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
        if (!title) title = host || payload.url;
        const source = payload.source || host;

        // AI categorize (best-effort)
        let ai: any = null;
        try {
          ai = await categorize({
            url: payload.url, title, description: payload.description, source,
            existingCollections: existingNames,
          });
        } catch (err) {
          console.warn("Categorize failed", err);
        }

        const category = ai?.category && CATEGORIES.includes(ai.category) ? ai.category : null;
        const tags: string[] = Array.isArray(ai?.tags)
          ? ai.tags.map((t: any) => String(t).toLowerCase().replace(/^#/, "").trim()).filter(Boolean).slice(0, 8)
          : [];

        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("items")
          .insert({
            user_id: userId,
            collection_id: payload.collection_id,
            title: title.slice(0, 500),
            url: payload.url,
            description: payload.description || null,
            image_url: payload.image || null,
            source: source || null,
            type: "link",
            tags,
            category,
            subcategory: ai?.subcategory ? String(ai.subcategory).slice(0, 200) : null,
            ai_summary: ai?.summary ? String(ai.summary).slice(0, 240) : null,
          })
          .select("id,title,category,subcategory,tags,ai_summary,collection_id")
          .single();

        if (insErr || !inserted) {
          return new Response(JSON.stringify({ error: insErr?.message || "Save failed" }), {
            status: 500, headers: { "Content-Type": "application/json", ...CORS },
          });
        }

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
            payload.description && `Notes: ${payload.description}`,
            source && `Source: ${source}`,
          ].filter(Boolean).join("\n");
          const vec = await embed(text);
          if (vec) {
            await supabaseAdmin.from("items")
              .update({ embedding: vec as any, embedding_updated_at: new Date().toISOString() })
              .eq("id", inserted.id);
          }
        } catch (err) {
          console.warn("Embed failed", err);
        }

        const suggestedCollection = ai?.suggested_collection
          ? String(ai.suggested_collection).slice(0, 80) : null;

        return new Response(JSON.stringify({
          ok: true,
          item: inserted,
          suggested_collection: suggestedCollection,
        }), {
          status: 200, headers: { "Content-Type": "application/json", ...CORS },
        });
      },
    },
  },
});
