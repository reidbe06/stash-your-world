import { createHmac, timingSafeEqual } from "node:crypto";

function getSecret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return key;
}

// Token format: stv1_{36-char UUID}_{64-char hex HMAC}
// Self-describing (userId embedded) — no DB lookup required.
export function generateSaveToken(userId: string): string {
  const hmac = createHmac("sha256", getSecret())
    .update(`stashd:save:${userId}`)
    .digest("hex");
  return `stv1_${userId}_${hmac}`;
}

// Returns userId if valid, null otherwise. Timing-safe comparison.
export function validateSaveToken(token: string): string | null {
  try {
    if (!token.startsWith("stv1_")) return null;
    const body = token.slice(5); // remove "stv1_"
    // UUID is always 36 chars (8-4-4-4-12 with hyphens, no underscores)
    if (body.length !== 36 + 1 + 64) return null;
    const userId = body.slice(0, 36);
    const givenHmac = body.slice(37); // skip the separating underscore at [36]
    const expectedHmac = createHmac("sha256", getSecret())
      .update(`stashd:save:${userId}`)
      .digest("hex");
    const givenBuf = Buffer.from(givenHmac, "hex");
    const expectedBuf = Buffer.from(expectedHmac, "hex");
    if (givenBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(givenBuf, expectedBuf)) return null;
    return userId;
  } catch {
    return null;
  }
}
