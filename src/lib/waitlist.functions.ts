import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Pool } from "pg";
import { Resend } from "resend";

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

let _resend: Resend | undefined;
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const CONFIRMATION_SUBJECT = "You're on the STASHd waitlist 🎉";
const CONFIRMATION_TEXT = `Thanks for joining the STASHd waitlist.

We're building the easiest way to save, organize, and execute on the things that inspire you online.

You'll be among the first to hear when early access becomes available.

✨ Save. Organize. Execute.

— The STASHd Team`;

const CONFIRMATION_HTML = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111;">
  <h2 style="font-size:22px;font-weight:800;margin:0 0 16px;">You're on the STASHd waitlist 🎉</h2>
  <p style="margin:0 0 12px;line-height:1.6;">Thanks for joining the STASHd waitlist.</p>
  <p style="margin:0 0 12px;line-height:1.6;">We're building the easiest way to save, organize, and execute on the things that inspire you online.</p>
  <p style="margin:0 0 24px;line-height:1.6;">You'll be among the first to hear when early access becomes available.</p>
  <p style="margin:0 0 8px;font-weight:700;">✨ Save. Organize. Execute.</p>
  <p style="margin:0;color:#888;">— The STASHd Team</p>
</body>
</html>
`;

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
    } catch (err: any) {
      if (err.code === "23505") {
        console.log(`[waitlist] Already on list: ${email}`);
        return { success: true, alreadyExists: true };
      }
      console.error(`[waitlist] Insert error:`, err.message, err.code);
      throw new Error(err.message);
    }

    try {
      const resend = getResend();
      const { error: emailError } = await resend.emails.send({
        from: "STASHd <onboarding@resend.dev>",
        to: email,
        subject: CONFIRMATION_SUBJECT,
        text: CONFIRMATION_TEXT,
        html: CONFIRMATION_HTML,
      });
      if (emailError) {
        console.error(`[waitlist] Email send error for ${email}:`, emailError);
      } else {
        console.log(`[waitlist] Confirmation email sent to: ${email}`);
      }
    } catch (emailErr: any) {
      console.error(`[waitlist] Email exception for ${email}:`, emailErr.message);
    }

    return { success: true, alreadyExists: false };
  });
