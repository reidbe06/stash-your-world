import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Pool } from "pg";

const schema = z.object({
  message: z.string().trim().min(1).max(2000),
  rating: z.enum(["great", "okay", "issue"]).optional(),
  page: z.string().max(200).optional(),
  email: z.string().email().max(255).optional().or(z.literal("")),
  user_id: z.string().max(100).optional(),
});

let _pool: Pool | undefined;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

export const submitFeedback = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const pool = getPool();
    await pool.query(
      `INSERT INTO beta_feedback (user_id, email, message, page, rating)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        data.user_id || null,
        data.email || null,
        data.message,
        data.page || null,
        data.rating || null,
      ]
    );
    return { ok: true };
  });
