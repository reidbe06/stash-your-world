---
name: Type name simplification
description: Canonical content_type values in DB — simplified names, not verbose legacy names
---

## Canonical values (DB `type` column)
Recipe, Fashion, Product, Home, Travel, Tutorial, Fitness, Beauty, Parenting, Business, Entertainment, Other, Needs Review

## Legacy names that were renamed (2026-06-01)
- "Fashion / Outfit" → "Fashion"
- "Home Idea" → "Home"
- "Travel Idea" → "Travel"
- "Fitness / Workout" → "Fitness"
- "Business Idea" → "Business"

## Files that reference these type names (must use simplified versions)
- src/lib/ai-categorize.functions.ts (CONTENT_TYPES array, enum)
- src/lib/share-ingest.server.ts (CONTENT_TYPES, contentTypeFromCategory)
- src/lib/ask-stashd.functions.ts (TYPE_KEYWORD_MAP)
- src/routes/_authenticated/dashboard.tsx (CONTENT_CATEGORIES keys)
- src/routes/_authenticated/search.tsx (CATEGORY_CHIPS keys)
- src/components/SaveItemDialog.tsx (type list)
- src/routes/_authenticated/save.tsx (TYPES array)

**Why:** DB was historically inconsistent; simplified names are shorter, easier to filter on, and match user-facing labels.
**How to apply:** Any new type added must use the simplified form everywhere. Run a DB UPDATE if renaming existing values.
