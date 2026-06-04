import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const inputSchema = z.object({
  email: z.string().email().max(500),
});

export type WaitlistResult = {
  success: boolean;
  alreadyExists: boolean;
};

export const joinWaitlist = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<WaitlistResult> => {
    const email = data.email.toLowerCase().trim();
    console.log(`[waitlist] Signup: ${email}`);

    const { error } = await supabaseAdmin
      .from("waitlist")
      .insert({ email });

    if (error) {
      if (error.code === "23505") {
        console.log(`[waitlist] Already on list: ${email}`);
        return { success: true, alreadyExists: true };
      }
      console.error(`[waitlist] Insert error:`, error.message, error.code);
      throw new Error(error.message);
    }

    console.log(`[waitlist] Added: ${email}`);
    return { success: true, alreadyExists: false };
  });
