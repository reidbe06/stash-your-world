---
name: yt-dlp integration pattern
description: How yt-dlp is wired into the STASHd transcript/ingest pipeline.
---

## Rule
Use `child_process.spawn` (not `Bun.spawn`) for calling yt-dlp. The `TranscriptResult` type carries a `ytdlp?: YtDlpEnrichment` field that share-ingest reads for title/creator/thumbnail enrichment.

**Why:**
- `Bun.spawn` is not in `@types/node` and causes TypeScript errors unless `bun-types` is added. `child_process.spawn` works in Bun runtime and already has types.
- Putting enrichment on `TranscriptResult` avoids calling yt-dlp twice (once for transcript, once for metadata).

**How to apply:**
- `src/lib/ytdlp.server.ts` — the wrapper. Returns `YtDlpData | null`. Logs all outcomes with `[yt-dlp]` prefix.
- `src/lib/transcript.server.ts` — calls `fetchYtDlpData` as Tier 1 for all three video platforms; attaches `ytdlp` enrichment to the returned `TranscriptResult`.
- `src/lib/share-ingest.server.ts` — reads `transcriptResult?.ytdlp` after `fetchTranscript` to fill creator, title (if platform default), thumbnail, and AI tag hints.
- yt-dlp subtitle priority: manual json3 → manual vtt → auto-cap json3 → auto-cap vtt → description text.
