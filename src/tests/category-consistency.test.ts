import { describe, test, expect } from "bun:test";
import { CONTENT_TYPES, SUBCATEGORY_TAXONOMY, CATEGORIES } from "../lib/taxonomy";
import { contentTypeFromCategory } from "../lib/content-type-utils";

// ─── Dashboard ↔ Search type key agreement ────────────────────────────────────
//
// dashboard.tsx CONTENT_CATEGORIES: match: (it) => it.type === key
// search.tsx    CATEGORY_CHIPS:     item.type === activeType
// Both filter on the DB column `type` (not `category`).

const DASHBOARD_TYPE_KEYS = [
  "Recipe", "Fashion", "Product", "Home", "Beauty",
  "Fitness", "Travel", "Tutorial", "Business", "Parenting",
] as const;

const SEARCH_CHIP_KEYS = [
  "Recipe", "Product", "Fashion", "Home", "Travel", "Tutorial",
  "Fitness", "Beauty", "Business", "Parenting", "Entertainment", "Other",
] as const;

describe("Dashboard ↔ Search filter key consistency", () => {
  test("all dashboard type keys are valid CONTENT_TYPES", () => {
    const validTypes = new Set(CONTENT_TYPES as readonly string[]);
    for (const key of DASHBOARD_TYPE_KEYS) {
      expect(validTypes.has(key), `dashboard key "${key}" not found in CONTENT_TYPES`).toBe(true);
    }
  });

  test("all search chip keys are valid CONTENT_TYPES", () => {
    const validTypes = new Set(CONTENT_TYPES as readonly string[]);
    for (const key of SEARCH_CHIP_KEYS) {
      expect(validTypes.has(key), `search chip "${key}" not found in CONTENT_TYPES`).toBe(true);
    }
  });

  test("every dashboard key also exists in search chips (no orphan filters)", () => {
    const searchSet = new Set<string>(SEARCH_CHIP_KEYS);
    for (const key of DASHBOARD_TYPE_KEYS) {
      expect(searchSet.has(key), `dashboard category "${key}" has no matching search chip — user can't filter to it`).toBe(true);
    }
  });

  test("search chips include Entertainment (shown on search but not dashboard category list)", () => {
    expect(SEARCH_CHIP_KEYS).toContain("Entertainment");
  });

  test("search chips include Other (catch-all)", () => {
    expect(SEARCH_CHIP_KEYS).toContain("Other");
  });
});

// ─── CATEGORIES / CONTENT_TYPES completeness ──────────────────────────────────

describe("CATEGORIES / CONTENT_TYPES completeness", () => {
  test("CATEGORIES has exactly 16 entries", () => {
    expect(CATEGORIES.length).toBe(16);
  });

  test("CATEGORIES contains all system-status entries", () => {
    const catSet = new Set(CATEGORIES as readonly string[]);
    expect(catSet.has("Needs Review")).toBe(true);
    expect(catSet.has("Uncategorized")).toBe(true);
    expect(catSet.has("Other")).toBe(true);
  });

  test("contentTypeFromCategory covers all non-meta CATEGORIES without returning Other", () => {
    const metaCategories = new Set(["Uncategorized", "Needs Review", "Other"]);
    const unmapped: string[] = [];
    for (const cat of CATEGORIES) {
      if (metaCategories.has(cat)) continue;
      const mapped = contentTypeFromCategory(cat);
      if (mapped === "Other") unmapped.push(cat);
    }
    expect(
      unmapped,
      `These CATEGORIES have no content_type mapping: ${unmapped.join(", ")}`
    ).toHaveLength(0);
  });

  test("contentTypeFromCategory output is always a valid CONTENT_TYPE", () => {
    const validTypes = new Set(CONTENT_TYPES as readonly string[]);
    for (const cat of CATEGORIES) {
      const mapped = contentTypeFromCategory(cat);
      expect(
        validTypes.has(mapped),
        `contentTypeFromCategory("${cat}") returned "${mapped}" — not in CONTENT_TYPES`
      ).toBe(true);
    }
  });
});

// ─── Subcategory taxonomy completeness ────────────────────────────────────────

describe("SUBCATEGORY_TAXONOMY completeness", () => {
  test("every non-Other CONTENT_TYPE has a subcategory list", () => {
    const covered = new Set(Object.keys(SUBCATEGORY_TAXONOMY));
    const missing = (CONTENT_TYPES as readonly string[]).filter(
      (t) => t !== "Other" && !covered.has(t)
    );
    expect(
      missing,
      `Content types missing subcategory taxonomy: ${missing.join(", ")}`
    ).toHaveLength(0);
  });

  test("no SUBCATEGORY_TAXONOMY key is missing from CONTENT_TYPES", () => {
    const validTypes = new Set(CONTENT_TYPES as readonly string[]);
    for (const key of Object.keys(SUBCATEGORY_TAXONOMY)) {
      expect(
        validTypes.has(key),
        `"${key}" in SUBCATEGORY_TAXONOMY is not a valid CONTENT_TYPE`
      ).toBe(true);
    }
  });

  test("each subcategory list has between 5 and 15 entries", () => {
    for (const [type, subs] of Object.entries(SUBCATEGORY_TAXONOMY)) {
      expect(subs.length, `${type} has too few subcategories (${subs.length})`).toBeGreaterThanOrEqual(5);
      expect(subs.length, `${type} has too many subcategories (${subs.length})`).toBeLessThanOrEqual(15);
    }
  });

  test("subcategory values are unique within each type", () => {
    for (const [type, subs] of Object.entries(SUBCATEGORY_TAXONOMY)) {
      const unique = new Set(subs.map((s) => s.toLowerCase()));
      expect(
        unique.size,
        `${type} has duplicate subcategories: ${subs.filter((s, i) => subs.indexOf(s) !== i).join(", ")}`
      ).toBe(subs.length);
    }
  });

  test("subcategory values are title-cased (not raw lowercase)", () => {
    for (const [type, subs] of Object.entries(SUBCATEGORY_TAXONOMY)) {
      for (const sub of subs) {
        const firstChar = sub.charAt(0);
        expect(
          firstChar === firstChar.toUpperCase(),
          `${type} subcategory "${sub}" is not title-cased`
        ).toBe(true);
      }
    }
  });
});

// ─── Category ordering consistency ────────────────────────────────────────────

describe("CATEGORIES ordering — Needs Review before Uncategorized", () => {
  test("Needs Review appears before Uncategorized in CATEGORIES", () => {
    const nrIdx = (CATEGORIES as readonly string[]).indexOf("Needs Review");
    const ucIdx = (CATEGORIES as readonly string[]).indexOf("Uncategorized");
    expect(nrIdx).toBeGreaterThan(-1);
    expect(ucIdx).toBeGreaterThan(-1);
    expect(
      nrIdx < ucIdx,
      `Expected "Needs Review" (index ${nrIdx}) before "Uncategorized" (index ${ucIdx}) — update ai-categorize.functions.ts if changed`
    ).toBe(true);
  });
});
