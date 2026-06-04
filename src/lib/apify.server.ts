/**
 * apify.server.ts
 *
 * Apify actor runner for social video caption extraction (Tier 2).
 * Called after yt-dlp fails for Instagram/TikTok from a datacenter IP.
 *
 * Actors used:
 *   TikTok     →  clockworks/free-tiktok-scraper  (verified working via postURLs)
 *   Instagram  →  apify/instagram-scraper          (requires cookies for direct reel URLs;
 *                                                   works for public profile/username scraping)
 *
 * Field shapes verified from live actor responses:
 *   TikTok:    item.text, item.authorMeta.{name,nickName,profileUrl}, item.hashtags[].name,
 *              item.videoMeta.coverUrl, item.webVideoUrl
 *   Instagram: item.caption, item.ownerUsername, item.ownerFullName, item.displayUrl,
 *              item.url, item.hashtags[]  (string array)
 *
 * Requires APIFY_API_TOKEN environment secret.
 */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_TIMEOUT_SECS = 55;
const HTTP_TIMEOUT_MS    = 75_000;

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
    console.log(`[Apify] Response received (${elapsed}ms): ${count} item(s)`);

    if (!Array.isArray(items) || items.length === 0) return null;

    // Check for actor-level errors
    const first = items[0] as Record<string, unknown>;
    if (first.error) {
      console.log(`[Apify] Actor ${actorSlug} returned error: ${first.error} — ${first.errorDescription ?? first.errorCode ?? ""}`);
      return null;
    }

    return items;
  } catch (err: unknown) {
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Apify] Actor ${actorSlug} error (${elapsed}ms): ${msg}`);
    return null;
  }
}

// ─── TikTok ──────────────────────────────────────────────────────────────────
// Verified working: clockworks/free-tiktok-scraper with postURLs
// Confirmed field shapes from live actor responses (2025-06-01)

export async function fetchTikTokApify(url: string): Promise<ApifyResult | null> {
  console.log(`[Apify] TikTok: starting actor run for ${url}`);

  const items = await runApifyActor("clockworks/free-tiktok-scraper", {
    postURLs:             [url],
    maxPostsPerQuery:     1,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  });

  if (!items?.length) return null;

  const item = items[0] as Record<string, unknown>;
  const authorMeta = (item.authorMeta ?? {}) as Record<string, unknown>;
  const videoMeta  = (item.videoMeta  ?? {}) as Record<string, unknown>;

  const caption   = strOrNull(item.text);
  const username  = strOrNull(authorMeta.name);        // handle/login name e.g. "gordonramsayofficial"
  const nickname  = strOrNull(authorMeta.nickName);    // display name e.g. "Gordon Ramsay"
  const profileUrl = strOrNull(authorMeta.profileUrl) ??
    (username ? `https://www.tiktok.com/@${username}` : null);
  const thumbnail = strOrNull(videoMeta.coverUrl);

  const hashtags: string[] = Array.isArray(item.hashtags)
    ? (item.hashtags as Array<Record<string, unknown>>)
        .map((h) => strOrNull(h.name) ?? "")
        .filter(Boolean)
    : [];

  const result: ApifyResult = {
    caption,
    creator_username:    username,
    creator_fullname:    nickname,
    creator_profile_url: profileUrl,
    thumbnail,
    hashtags,
    title:        null,
    original_url: strOrNull(item.webVideoUrl) ?? url,
  };

  console.log(
    `[Apify] TikTok: ` +
    `caption_len=${caption?.length ?? 0} ` +
    `creator=${JSON.stringify(nickname ?? username)} ` +
    `hashtags=${hashtags.length} ` +
    `thumbnail=${!!thumbnail}`,
  );
  if (caption) {
    console.log(`[Apify] TikTok caption (first 300): ${JSON.stringify(caption.slice(0, 300))}`);
  }

  // Return result if we have a caption OR a thumbnail — don't discard thumbnails
  return (caption || thumbnail) ? result : null;
}

// ─── Instagram ───────────────────────────────────────────────────────────────
// Limitation: apify/instagram-scraper returns "restricted_page" for direct reel
// URLs on the free plan (requires user-provided login cookies to bypass).
// Workaround: extract the post shortcode from the URL, then try via multiple approaches.
// Confirmed field shapes from profile-based scraping (2025-06-01):
//   item.caption, item.ownerUsername, item.ownerFullName, item.displayUrl,
//   item.url, item.hashtags[] (string[])

export async function fetchInstagramApify(url: string): Promise<ApifyResult | null> {
  console.log(`[Apify] Instagram: starting actor run for ${url}`);

  // Extract the shortcode from the URL to build a clean scrape request
  const shortcodeMatch = url.match(/\/(reel|p|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = shortcodeMatch?.[2] ?? null;

  if (!shortcode) {
    console.log(`[Apify] Instagram: could not extract shortcode from URL — skipping`);
    return null;
  }

  const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

  const items = await runApifyActor("apify/instagram-scraper", {
    directUrls:    [canonicalUrl],
    resultsType:   "posts",
    resultsLimit:  1,
    proxy: {
      useApifyProxy:       true,
      apifyProxyGroups:    ["RESIDENTIAL"],
    },
  });

  if (!items?.length) {
    console.log(`[Apify] Instagram: actor returned null/empty — direct reel URLs require authenticated cookies on Apify free plan`);
    return null;
  }

  const item = items[0] as Record<string, unknown>;

  const caption  = strOrNull(item.caption);
  const username = strOrNull(item.ownerUsername);
  const fullname = strOrNull(item.ownerFullName);
  const thumbnail = strOrNull(item.displayUrl);
  const originalUrl = strOrNull(item.url) ?? url;

  // hashtags comes as string[] in instagram-scraper
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
    console.log(`[Apify] Instagram caption (first 300): ${JSON.stringify(caption.slice(0, 300))}`);
  }

  // Return result if we have a caption OR a thumbnail — don't discard thumbnails
  return (caption || thumbnail) ? result : null;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}
