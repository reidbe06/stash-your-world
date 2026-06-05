---
name: TikTok/Instagram thumbnail extraction and caching
description: Root cause diagnosis and fix for Instagram/TikTok thumbnails rendering as placeholders
---

## Root cause (confirmed June 2026)

Instagram CDN URLs (`scontent-*.cdninstagram.com`) work server-side but return HTTP 403
in the browser. This is Referer-based hotlink protection — Instagram blocks `<img src>`
from non-instagram.com origins. The `oe=` expiry and `oh=` auth tokens are NOT the issue;
the URLs are valid but hotlink-blocked.

TikTok CDN URLs (`p16-sign.tiktokcdn*.com`) have the same problem.

**The thumbnails WERE being stored in DB correctly. The failure was at render time.**

## Fix layers

1. **cacheThumbnailToStorage(rawUrl, platform, seed)** in share-ingest.server.ts:
   - Downloads CDN image server-side with correct Referer header (200 OK from server)
   - Uploads to Supabase Storage `thumbnails` bucket (public, upsert, 1-year cache)
   - Returns the permanent public Supabase Storage URL
   - Called from ingestSharedUrl() for tiktok/instagram/instagram_reel after image is set
   - Called from refreshThumbnailBackground() before DB update

2. **transcript.server.ts** — both TikTok and Instagram Apify branches handle thumbnail-only
   (when Apify has thumbnail but no caption). If only one platform has this, regression occurs.

3. **url-metadata.server.ts** — TikTok oEmbed retried 3× with 5s timeout per attempt

4. **ItemImage.tsx** — client-side onError shows platform-branded placeholder (never blank)

## Supabase Storage setup

Bucket: `thumbnails` (public, 5MB file limit)
Path: `{platform}/{hash36_of_canonical_url}.{ext}`
Public URL: `{SUPABASE_URL}/storage/v1/object/public/thumbnails/{path}`

## Key test

Server-side test: `await fetch(instagramCdnUrl)` → 200 ✓
Browser context: `<img src={instagramCdnUrl}>` → 403 ✗ (hotlink protection)
Supabase Storage URL: accessible from any context, no auth needed ✓

## apify.server.ts invariant

Both TikTok AND Instagram: `return (caption || thumbnail) ? result : null`
Both transcript.server.ts branches must handle thumbnail-only case or one platform regresses.

**Why:** Instagram/TikTok CDN URLs are hotlink-protected and cannot load in browser.
Must cache via own storage at ingest time, not just store raw CDN URL.
**How to apply:** Any new social platform with hotlink-protected thumbnails → add to
`isHotlinkProtected` check in share-ingest.server.ts and `cacheThumbnailToStorage`.
