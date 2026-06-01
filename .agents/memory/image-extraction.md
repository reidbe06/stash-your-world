---
name: Image extraction pipeline
description: How STASHd picks the best thumbnail from a URL; score-based with rejection filter
---

## Key functions (url-metadata.server.ts)

- `isRejectedImageUrl(url)` — rejects logos, icons, favicons, avatars, sprites, tracking pixels, GIFs
- `scoreImageCandidate(url, attrs)` — scores by URL pattern, explicit dimensions, class/id semantics, alt text
- `pickImageFromHtml(html, target)` — score-based; checks link:image_src, itemprop:image, all data-* lazy variants, raw URL scan
- `pickJsonLd(html)` — type-prioritized: Product → Recipe → Article → VideoObject → ImageObject → WebPage → generic

## Priority order in fetchMetadata
1. og:image / twitter:image (validated: reject if URL pattern bad OR og:image:width/height < 100)
2. JSON-LD image (type-prioritized)
3. HTML score-based scan
4. Firecrawl (full extract + html fallback)
5. CDN pattern (Best Buy etc.)
6. DuckDuckGo image search (blocked hosts only)

## data-* attributes scanned in pickImageFromHtml
data-zoom-image, data-large-image, data-large_image, data-high-res-src, data-full-size-url,
data-full-res-src, src, data-src, data-lazy-src, data-original, data-url, srcset

## "Add image manually" UI (save.tsx)
Shown when `metaLoaded && !fetching`:
- If image_url set: thumbnail preview card with Remove button
- If no image_url: dashed-border input field for manual URL paste

**Why:** Product pages often hide images behind lazy-load attributes or JSON-LD that wasn't
prioritized by type, causing blank thumbnails even when the page has a product photo.
**How to apply:** When adding new image sources, run them through `isRejectedImageUrl` first,
then `scoreImageCandidate`. Always log with `[url-metadata:host]` prefix for debuggability.
