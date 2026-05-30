import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getUserIdFromBearer, ingestSharedUrl } from "@/lib/share-ingest.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const InputSchema = z.object({
  url: z.string().trim().min(1).max(2000).url(),
  title: z.string().trim().max(500).optional().default(""),
  description: z.string().trim().max(2000).optional().default(""),
  image: z.string().trim().max(2000).optional().nullable().default(null),
  source: z.string().trim().max(200).optional().default(""),
  note: z.string().trim().max(2000).optional().nullable().default(null),
  context_type: z.string().trim().max(80).optional().nullable().default(null),
  skip_ai: z.boolean().optional().default(false),
  collection_id: z.string().uuid().nullable().optional().default(null),
});

export const Route = createFileRoute("/api/public/extension/save")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const userId = await getUserIdFromBearer(request);
        if (!userId) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        let payload: z.infer<typeof InputSchema>;
        try {
          payload = InputSchema.parse(await request.json());
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message || "Invalid input" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        try {
          const result = await ingestSharedUrl({
            userId,
            url: payload.url,
            title: payload.title || null,
            description: payload.description || null,
            image: payload.image || null,
            source: payload.source || null,
            note: payload.note || null,
            context_type: payload.context_type || null,
            skip_ai: payload.skip_ai,
            collection_id: payload.collection_id,
            share_source: "extension",
          });
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err?.message || "Save failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});