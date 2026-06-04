import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Pool } from "pg";

const inputSchema = z.object({
  email: z.string().email().max(500),
});

export type WaitlistResult = {
  success: boolean;
  alreadyExists: boolean;
};

let _pool: Pool | undefined;
function getPool() {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

export const joinWaitlist = createServerFn({ method: "POST" })
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<WaitlistResult> => {
    const email = data.email.toLowerCase().trim();
    console.log(`[waitlist] Signup attempt: ${email}`);

    const pool = getPool();
    try {
      await pool.query(
        "INSERT INTO waitlist_signups (email) VALUES ($1)",
        [email]
      );
      console.log(`[waitlist] Added: ${email}`);
      return { success: true, alreadyExists: false };
    } catch (err: any) {
      if (err.code === "23505") {
        console.log(`[waitlist] Already on list: ${email}`);
        return { success: true, alreadyExists: true };
      }
      console.error(`[waitlist] Insert error:`, err.message, err.code);
      throw new Error(err.message);
    }
  });
