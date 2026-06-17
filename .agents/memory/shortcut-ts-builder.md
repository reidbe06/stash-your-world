---
name: iOS Shortcut TS builder + clean URL architecture
description: Why Python was replaced with TS, and why Supabase Storage is used for the shortcut URL
---

# iOS Shortcut generation — TS builder + Supabase Storage

**Rule:** Never use `spawnSync("python3", ...)`. Never pass `/api/shortcut?token=...` into `shortcuts://import-shortcut`. Use Supabase Storage for the clean public URL.

**Architecture:**
1. Profile page POSTs to `/api/me/shortcut-upload` (authenticated)
2. Server generates bytes via `buildShortcut()` in `src/lib/shortcut-builder.server.ts` (<5ms, pure TS)
3. Server uploads to Supabase Storage bucket `shortcuts` at path `{userId}/STASHd.shortcut` (public, upsert)
4. Returns `{ url, shortcutsDeepLink }` where url = clean Supabase Storage URL ending in `STASHd.shortcut`
5. Profile page opens `shortcuts://import-shortcut?url=<encoded-supabase-url>`

**Why Storage:**
- iOS Shortcuts may reject `shortcuts://import-shortcut?url=` values that contain query strings (`?token=...`)
- Supabase Storage URL is clean: `https://<project>.supabase.co/storage/v1/object/public/shortcuts/<userId>/STASHd.shortcut`
- No query string, no auth, no redirect, direct HTTP 200 with `application/octet-stream`

**Why Python was removed:**
- Python startup in Replit container takes 5–30s; the endpoint had 10s timeout → ~50% of requests timed out → returned JSON instead of plist → iOS showed "Import Failed"

**WFURL must be dict, not string:**
- Plain string `WFURL` causes "The shortcut URL provided was invalid" on iOS 15+
- Must be: `{ Value: { string: "..." }, WFSerializationType: "WFTextTokenString" }`

**Bucket:** `shortcuts` (public, created idempotently in endpoint handler)
**Version marker:** `WFWorkflowName: "Save to STASHd v2"` — lets user confirm they got the new file.
