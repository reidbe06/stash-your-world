---
name: SUBCATEGORY_PATTERNS first-match semantics
description: detectSubcategory returns the first pattern in the array that matches the question, not the most specific one
---

## Rule
`detectSubcategory(question, contentType)` iterates `SUBCATEGORY_PATTERNS[contentType]` in array order and returns the **first** pattern whose string appears (case-insensitive substring) in the question.

## Consequences
- "salad for meal prep" → "meal prep" (not "salad"), because "meal prep" is earlier in Recipe patterns
- "summer dresses I liked" → "dress" (not "dresses"), because "dress" is earlier in Fashion patterns
- "casual work outfit" → "work outfit" (not "casual"), because "work outfit" is earlier in Fashion patterns
- "show me shoes I saved" → "shoe" (not "shoes"), because "shoe" is earlier in Fashion patterns
- "nail polish collection" → null, because the pattern is "nails" (not "nail")

**Why:** The function does a simple `lower.includes(pat)` check, returning on first match. Longer/more-specific patterns should be placed earlier in the array if you want them to take priority.

**How to apply:** When adding or reordering SUBCATEGORY_PATTERNS entries, put multi-word or more-specific patterns BEFORE shorter/more-general ones. Tests should assert the first-match behavior, not the most-specific match.
