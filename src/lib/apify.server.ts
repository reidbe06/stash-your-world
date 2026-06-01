/**
 * apify.server.ts
 *
 * Apify actor runner for social video caption extraction (Tier 2).
 * Called after yt-dlp fails for Instagram/TikTok from a datacenter IP.
 *
 * Actors used:
 *   Instagram  →  apify/instagram-scraper
 *   TikTok     →  clockworks/tiktok-scraper
 *
 * Requires APIFY_API_TOKEN environment secret.
 */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_TIMEOUT_SECS = 55;          // max run time for the actor
const HTTP_TIMEOUT_MS    = 75_000;      // AbortSignal timeout (actor + overhead)

export type ApifyResult = {
  caption:              string | null;
  creator_username:     string | null;
  creator_fullname:     string | null;
  creator_profile_url:  string | null;
  thumbnail:            string | null;
  hashtags:             string[];
  title:                string | null;
  original_url:         string | null;
};

// ─── Generic runner ──────────────────────────────────────────────────────────

async function runApifyActor(
  actorSlug: string,
  input: Record<string, unknown>,
): Promise<unknown[] | null> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    console.log(`[Apify] APIFY_API_TOKEN not configured — skipping`);
    return null;
  }

  // Actor IDs in URLs use ~ instead of /
  const actorId = actorSlug.replace("/", "~");
  const endpoint = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items` +
    `?token=${token}&timeout=${ACTOR_TIMEOUT_SECS}&memory=256`;

  const t0 = Date.now();
  console.log(`[Apify] Calling actor: ${actorSlug}`);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });

    const elapsed = Date.now() - t0;

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.log(`[Apify] Actor ${actorSlug} HTTP ${res.status} (${elapsed}ms): ${errText.slice(0, 200)}`);
      return null;
    }

    const items = await res.json();
    const count = Array.isArray(items) ? items.length : "non-array";
    console.log(`[Apify] Response received (${elapsed}ms): ${count} items`);

    return Array.isArray(items) && items.length > 0 ? items : null;
  } catch (err: unknown) {
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Apify] Actor ${actorSlug} error (${elapsed}ms): ${msg}`);
    return null;
  }
}

// ─── Instagram ───────────────────────────────────────────────────────────────

export async function fetchInstagramApify(url: string): Promise<ApifyResult | null> {
  console.log(`[Apify] Instagram: starting actor run for ${url}`);

  const items = await runApifyActor("apify/instagram-scraper", {
    directUrls:    [url],
    resultsType:   "posts",
    resultsLimit:  1,
    addParentData: false,
  });

  if (!items?.length) {
    console.log(`[Apify] Instagram: no items returned`);
    return null;
  }

  const item = items[0] as Record<string, unknown>;

  // Field extraction — be defensive, each field may be missing
  const caption      = strOrNull(item.caption);
  const username     = strOrNull(item.ownerUsername);
  const fullname     = strOrNull(item.ownerFullName);
  const thumbnail    = strOrNull(item.displayUrl) ?? strOrNull(item.thumbnailSrc);
  const originalUrl  = strOrNull(item.url) ?? url;

  const hashtags: string[] = Array.isArray(item.hashtags)
    ? (item.hashtags as unknown[])
        .filter((h): h is string => typeof h === "string")
        .map((h) => h.replace(/^#/, "").trim())
        .filter(Boolean)
    : [];

  const result: ApifyResult = {
    caption,
    creator_username:    username,
    creator_fullname:    fullname,
    creator_profile_url: username ? `https://www.instagram.com/${username}/` : null,
    thumbnail,
    hashtags,
    title:        null,
    original_url: originalUrl,
  };

  console.log(
    `[Apify] Instagram: ` +
    `caption_len=${caption?.length ?? 0} ` +
    `creator=${JSON.stringify(username ?? fullname)} ` +
    `hashtags=${hashtags.length} ` +
    `thumbnail=${!!thumbnail}`,
  );
  if (caption) {
    console.log(`[Apify] Instagram caption (first 200): ${JSON.stringify(caption.slice(0, 200))}`);
  }

  return caption ? result : null;
}

// ─── TikTok ──────────────────────────────────────────────────────────────────

export async function fetchTikTokApify(url: string): Promise<ApifyResult | null> {
  console.log(`[Apify] TikTok: starting actor run for ${url}`);

  const items = await runApifyActor("clockworks/tiktok-scraper", {
    postURLs:                    [url],
    maxPostsPerQuery:            1,
    shouldDownloadVideos:        false,
    shouldDownloadCovers:        false,
    shouldDownloadSubtitles:     false,
    shouldDownloadSlideshowImages: false,
  });

  if (!items?.length) {
    console.log(`[Apify] TikTok: no items returned`);
    return null;
  }

  const item = items[0] as Record<string, unknown>;

  // TikTok scraper fields
  const caption = strOrNull(item.text);

  const authorMeta = (item.authorMeta ?? {}) as Record<string, unknown>;
  const creatorName = strOrNull(authorMeta.name);
  const creatorNick = strOrNull(authorMeta.nickName ?? authorMeta.nickname);

  const covers    = (item.covers ?? {}) as Record<string, unknown>;
  const thumbnail = strOrNull(covers.default ?? covers.medium ?? covers.origin);

  const hashtags: string[] = Array.isArray(item.hashtags)
    ? (item.hashtags as Array<Record<string, unknown>>)
        .map((h) => strOrNull(h.name) ?? "")
        .filter(Boolean)
        .map((h) => h.replace(/^#/, "").trim())
    : [];

  const videoUrl = strOrNull(item.webVideoUrl) ?? strOrNull(item.shareUrl) ?? url;

  const result: ApifyResult = {
    caption,
    creator_username:    creatorNick,
    creator_fullname:    creatorName,
    creator_profile_url: creatorNick ? `https://www.tiktok.com/@${creatorNick}` : null,
    thumbnail,
    hashtags,
    title:        null,
    original_url: videoUrl,
  };

  console.log(
    `[Apify] TikTok: ` +
    `caption_len=${caption?.length ?? 0} ` +
    `creator=${JSON.stringify(creatorName ?? creatorNick)} ` +
    `hashtags=${hashtags.length} ` +
    `thumbnail=${!!thumbnail}`,
  );
  if (caption) {
    console.log(`[Apify] TikTok caption (first 200): ${JSON.stringify(caption.slice(0, 200))}`);
  }

  return caption ? result : null;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}
