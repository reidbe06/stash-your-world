---
name: Three-level taxonomy
description: How STASHd organizes saved items across three levels: Type, Subcategory, Tags
---

## Level structure
- **Level 1 (type)**: Recipe, Fashion, Product, Home, Travel, Tutorial, Fitness, Beauty, Parenting, Business, Entertainment, Other
- **Level 2 (subcategory)**: Per-type lists defined in SUBCATEGORY_TAXONOMY constant
- **Level 3 (tags)**: Free-form tag array

## Key constraint
`SUBCATEGORY_TAXONOMY` is duplicated in two files — keep them in sync:
- `src/lib/ai-categorize.functions.ts` (used by manual save / categorizeItem server fn)
- `src/lib/share-ingest.server.ts` (used by share extension ingest pipeline)

## AI prompt guidance
Both files build a `SUBCATEGORY_HINT` string from the taxonomy and inject it into the
OpenAI system prompt. The prompt says: "subcategory must be ONE value from this taxonomy".

## DB columns
- `type` = Level 1 canonical type (simplified names, see type-names.md)
- `subcategory` = Level 2 single value (e.g. "Dinner", "Dresses")
- `ai_subcategory` = also exists but `subcategory` is the primary field used everywhere
- `tags` = Level 3 array

**Why:** Users need to navigate Recipes > Dinner, Fashion > Dresses in the Library and Search.
**How to apply:** When adding new content types or subcategories, update SUBCATEGORY_TAXONOMY in both files and re-run a backfill script for existing items.
