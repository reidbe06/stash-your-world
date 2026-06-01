---
name: Test architecture
description: How the STASHd unit test suite is structured and which files are importable in bun test
---

## Pure-logic layer (importable in bun test)
- `src/lib/taxonomy.ts` — zero imports; exports CATEGORIES, CONTENT_TYPES, MEDIA_FORMATS, SUBCATEGORY_TAXONOMY as const
- `src/lib/content-type-utils.ts` — imports only from taxonomy.ts; exports detectPlatform, contentTypeFromCategory, platformToMediaFormat, isVideoPlatform, SourcePlatform type, isBrowseQuery, TYPE_KEYWORD_MAP, detectContentType, SUBCATEGORY_PATTERNS, detectSubcategory, STOP_WORDS, extractTopicKeywords
- `src/lib/url-metadata.server.ts` — no framework imports; exports isRejectedImageUrl, scoreImageCandidate, pickJsonLd, pickImageFromHtml, inferType, isMeaningfulMetadataValue, bestTitleFromUrl

## Framework-dependent files (NOT importable in bun test)
- `src/lib/ai-categorize.functions.ts` — has createServerFn; now re-exports constants from taxonomy.ts
- `src/lib/share-ingest.server.ts` — has supabaseAdmin; imports from taxonomy + content-type-utils
- `src/lib/ask-stashd.functions.ts` — has createServerFn + supabaseAdmin; imports pure functions from content-type-utils

## Test files
- `src/tests/image-extraction.test.ts` — tests url-metadata.server.ts exports
- `src/tests/content-type.test.ts` — tests content-type-utils + taxonomy constants
- `src/tests/ask-detection.test.ts` — tests ask-detection functions from content-type-utils
- `src/tests/category-consistency.test.ts` — static consistency checks across taxonomy

## Run
```
bun test src/tests/
```
146 tests, 571 expect() calls, ~130ms runtime.

**Why:** Files with createServerFn or supabaseAdmin fail at import time in bun test. All pure logic must live in framework-free files to be testable.
