---
name: TikTok/Instagram thumbnail extraction
description: Multi-layer thumbnail fix for TikTok and Instagram, including a regression from the first round
---

## The problem
TikTok's `og:image` returns `tiktok.com/api/img/?itemId=...` — ephemeral, auth-gated, renders as 403 in browser.
Instagram og:image works intermittently (Instagram blocks datacenter scraping).

## Critical lesson: apify.server.ts return condition
Both `fetchTikTokApify` and `fetchInstagramApify` previously returned null when no caption.
Changed to `return (caption || thumbnail) ? result : null`.
**This creates a transcript.server.ts responsibility:** both TikTok and Instagram Apify branches
must handle the thumbnail-only case (when apify is non-null but caption is missing).
If you only add one and not the other, you create a regression for the other platform.

## Fix layers (all five must be in place)

1. **url-metadata.server.ts** — reject `api/img` TikTok URLs via `isTikTokApiImg` check.
   oEmbed is called with `tryOembedWithRetry()` — TikTok gets 3 attempts × 5s timeout.

2. **apify.server.ts** — return `(caption || thumbnail) ? result : null` for both platforms.

3. **transcript.server.ts TikTok** — if Apify returns thumbnail-only (no caption), return
   `{ text: "", method: "tiktok_apify_thumb", ytdlp: enrichment }` so share-ingest can use it.

4. **transcript.server.ts Instagram** — SAME pattern as TikTok. Without this, the Apify thumbnail
   is silently dropped when caption is missing (the Instagram regression in round 2).

5. **share-ingest.server.ts** — thumbnail priority: `if (ytEnrich.thumbnail && (!image || isTikTokApiImg))`
   — uses Apify/yt-dlp thumbnail when image is null OR when image is the bad api/img URL.
   After save: `refreshThumbnailBackground()` fires if image still null — retries oEmbed + Apify
   and updates `image_url` in DB.

6. **ItemImage.tsx** — client-side `onError` shows platform-branded placeholder (never blank box).

## Logging
`logThumbnail(platform, url, method, attempt, success, thumbnailUrl)` emits `[THUMBNAIL]` blocks.
`[THUMBNAIL-REFRESH]` logs from background refresh function in share-ingest.server.ts.

**Why:** TikTok/Instagram CDN URLs are signed and expire. Always need server-side (get best URL)
+ client-side (graceful expiry) + background refresh (fix after failed ingest) defenses.
