---
name: yt-dlp platform reality
description: Which video platforms yt-dlp can access from Replit's server environment (datacenter IP).
---

## Rule
yt-dlp only works reliably for YouTube from Replit's server environment. Instagram and TikTok fail at the network/auth level.

**Why:**
- Replit servers have datacenter IPs. TikTok actively blocks datacenter IP requests ("Your IP address is blocked").
- Instagram now requires authenticated cookies for ALL content, even public posts ("Instagram API is not granting access / Instagram sent an empty media response").
- YouTube works perfectly: returns full metadata, subtitle track URLs (json3/vtt formats), description, uploader, tags, thumbnail.

**How to apply:**
- For Instagram extraction: yt-dlp is Tier 1 but will always fail → Firecrawl (also 403) → og:description scrape → needs_user_context. Next real tier is Apify.
- For TikTok extraction: yt-dlp is Tier 1 but always fails → page scrape (user-agent rotation) → Firecrawl.
- For YouTube: yt-dlp is Tier 1 and succeeds. The `automatic_captions.en` json3 track gives clean subtitle text. Also extracts description, uploader, tags, thumbnail.
- Never report yt-dlp as "Tier 1 with 60% success" for Instagram — that figure applies to residential IPs only.
