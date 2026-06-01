---
name: yt-dlp + Apify integration pattern
description: How yt-dlp and Apify are wired into the STASHd transcript/ingest pipeline.
---

## Rule
Use `child_process.spawn` (not `Bun.spawn`) for yt-dlp. Use `fetch` with Apify's run-sync-get-dataset-items endpoint. `TranscriptResult` carries a `ytdlp?: YtDlpEnrichment` field that share-ingest reads for title/creator/thumbnail/hashtag enrichment. Apify results are mapped through `apifyToEnrichment()` into the same `ytdlp` field.

**Why:**
- `Bun.spawn` is not in `@types/node` and causes TypeScript errors unless `bun-types` is added.
- Putting enrichment on `TranscriptResult` avoids calling yt-dlp/Apify twice (once for transcript, once for metadata).
- Single enrichment type (`YtDlpEnrichment`) shared across yt-dlp and Apify — both produce same shape.

**Key files:**
- `src/lib/ytdlp.server.ts` — child_process.spawn wrapper; logs `[yt-dlp]`
- `src/lib/apify.server.ts` — fetch wrapper for Apify actors; logs `[Apify]`
- `src/lib/transcript.server.ts` — tier ordering for each platform; attaches `ytdlp` enrichment
- `src/lib/share-ingest.server.ts` — reads `transcriptResult?.ytdlp` after `fetchTranscript` to fill creator, title, thumbnail, hashtags for AI

**Apify actor input shapes (verified 2025-06-01):**
- TikTok `clockworks/free-tiktok-scraper`: `{ postURLs: [url], maxPostsPerQuery: 1, shouldDownloadVideos: false, shouldDownloadCovers: false }`
- Instagram `apify/instagram-scraper`: `{ directUrls: [url], resultsType: "posts", resultsLimit: 1, proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] } }` — but returns restricted_page on free plan

**aiCategorize accepts `hashtags?: string[]`** — passed from enrichment tags for better AI context.
