---
name: TikTok thumbnail extraction
description: Why TikTok thumbnails were blank and the multi-layer fix applied
---

## The problem
TikTok's `og:image` returns `https://www.tiktok.com/api/img/?itemId=...` — an ephemeral,
auth-gated URL that works during server-side fetch but returns 403 when a browser tries to load it.

## Fix layers (all must be in place)

1. **url-metadata.server.ts** — reject `api/img` URLs via `isTikTokApiImg` check so oEmbed
   `thumbnail_url` is used instead (stable CDN URL).

2. **apify.server.ts** — return Apify result when `caption || thumbnail` (not just caption).
   Previously thumbnail was discarded when video had no caption text.

3. **transcript.server.ts** — TikTok Apify branch: if no caption but thumbnail exists,
   return `{ text: "", method: "tiktok_apify_thumb", ytdlp: enrichment }` so share-ingest
   can pick up the thumbnail via `ytEnrich.thumbnail`.

4. **share-ingest.server.ts** — thumbnail priority check updated from `!image` to
   `!image || imageIsTikTokApiImg` so Apify/yt-dlp thumbnail replaces any api/img URL
   that somehow slipped through.

5. **ItemImage.tsx** — client-side `onError` fallback: shows branded platform placeholder
   (TikTok/Instagram/YouTube/Pinterest/Vimeo) when stored image URL has expired.
   Used in ItemCard.tsx and search.tsx ResultCard.

**Why:** TikTok signed CDN URLs (even from oEmbed) expire after hours/days. The onError
fallback ensures cards are never blank even after expiry. Always need both server-side
(get best URL) and client-side (graceful expiry) defenses.
