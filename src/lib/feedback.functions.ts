import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const schema = z.object({
  message: z.string().trim().min(1).max(2000),
  rating: z.enum(["great", "okay", "issue"]).optional(),
  page: z.string().max(200).optional(),
  email: z.string().email().max(255).optional().or(z.literal("")),
  user_id: z.string().max(100).optional(),
});

export const submitFeedback = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("beta_feedback")
      .insert({
        user_id: data.user_id || null,
        email: data.email || null,
        message: data.message,
        page: data.page || null,
        rating: data.rating || null,
      });

    if (error) {
      console.error("[feedback] Supabase insert error:", error.message);
      throw new Error("Failed to save feedback.");
    }

    return { ok: true };
  });
