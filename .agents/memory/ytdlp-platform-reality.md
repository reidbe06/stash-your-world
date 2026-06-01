---
name: yt-dlp platform reality
description: Which video platforms yt-dlp and Apify can access from Replit's server environment.
---

## Rule
From Replit's datacenter IP:

**yt-dlp:**
- YouTube: ✅ Full metadata + subtitle tracks (json3/vtt) + description
- TikTok: ✅ Works for SOME videos (returns description) — IP not universally blocked
- Instagram: ❌ Requires login cookies — always returns "empty media response"

**Apify free plan:**
- TikTok: ✅ `clockworks/free-tiktok-scraper` with `postURLs` works reliably (verified 2025-06-01)
  - Fields: `item.text`, `item.authorMeta.{name, nickName, profileUrl}`, `item.hashtags[].name`, `item.videoMeta.coverUrl`, `item.webVideoUrl`
- Instagram: ❌ `apify/instagram-scraper` returns "restricted_page" for direct reel URLs even with residential proxy
  - Requires user-provided login cookies for direct post/reel URLs
  - Works for profile/username scraping but NOT direct reel URLs on free plan

**Why:**
- Instagram blocks all server-side anonymous access (even residential proxies) since ~2024 crackdown
- TikTok's datacenter blocking is inconsistent — yt-dlp works for older/less-popular videos, Apify fills the gap
- The "60% success" figure for Instagram was for residential IPs with user sessions — not applicable here

**How to apply:**
- Pipeline order for TikTok: yt-dlp → Apify free-tiktok-scraper → page scrape → Firecrawl
- Pipeline order for Instagram: yt-dlp → Apify instagram-scraper (will fail, logs reason) → Firecrawl (403) → page scrape → needs_user_context
- To unlock Instagram: need APIFY_INSTAGRAM_COOKIES env var with logged-in session cookies from a real browser
