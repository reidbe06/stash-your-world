import { describe, test, expect } from "bun:test";
import {
  contentTypeFromCategory,
  detectPlatform,
  platformToMediaFormat,
  isVideoPlatform,
} from "../lib/content-type-utils";
import { CONTENT_TYPES, SUBCATEGORY_TAXONOMY, CATEGORIES } from "../lib/taxonomy";

// ─── contentTypeFromCategory ──────────────────────────────────────────────────

describe("contentTypeFromCategory — every category maps correctly", () => {
  const cases: [string, string][] = [
    ["Recipes",        "Recipe"],
    ["Products",       "Product"],
    ["Shopping Deals", "Product"],
    ["Fashion",        "Fashion"],
    ["Home",           "Home"],
    ["Travel",         "Travel"],
    ["Fitness",        "Fitness"],
    ["Beauty",         "Beauty"],
    ["Parenting",      "Parenting"],
    ["Business Ideas", "Business"],
    ["Entertainment",  "Entertainment"],
    ["Videos",         "Entertainment"],
    ["Education",      "Tutorial"],
  ];

  for (const [category, expected] of cases) {
    test(`"${category}" → "${expected}"`, () => {
      expect(contentTypeFromCategory(category)).toBe(expected);
    });
  }

  test("unknown category → Other", () => {
    expect(contentTypeFromCategory("XYZ Unknown")).toBe("Other");
    expect(contentTypeFromCategory("")).toBe("Other");
    expect(contentTypeFromCategory("Uncategorized")).toBe("Other");
    expect(contentTypeFromCategory("Needs Review")).toBe("Other");
  });

  test("all mapped values are valid CONTENT_TYPES", () => {
    const validTypes = new Set(CONTENT_TYPES as readonly string[]);
    const toCheck = ["Recipes", "Products", "Shopping Deals", "Fashion", "Home", "Travel",
      "Fitness", "Beauty", "Parenting", "Business Ideas", "Entertainment", "Videos", "Education"];
    for (const cat of toCheck) {
      const mapped = contentTypeFromCategory(cat);
      expect(validTypes.has(mapped), `"${cat}" mapped to invalid type "${mapped}"`).toBe(true);
    }
  });
});

// ─── detectPlatform ───────────────────────────────────────────────────────────

describe("detectPlatform — URL → platform identifier", () => {
  test("TikTok", () => {
    expect(detectPlatform("https://www.tiktok.com/@creator/video/1234567890")).toBe("tiktok");
    expect(detectPlatform("https://tiktok.com/@user/video/123")).toBe("tiktok");
    expect(detectPlatform("https://vm.tiktok.com/abcdef")).toBe("tiktok");
  });

  test("Instagram post (non-reel)", () => {
    expect(detectPlatform("https://www.instagram.com/p/abc123")).toBe("instagram");
    expect(detectPlatform("https://www.instagram.com/username/")).toBe("instagram");
  });

  test("Instagram reel", () => {
    expect(detectPlatform("https://www.instagram.com/reel/abc123")).toBe("instagram_reel");
    expect(detectPlatform("https://www.instagram.com/reels/abc123")).toBe("instagram_reel");
  });

  test("YouTube video", () => {
    expect(detectPlatform("https://www.youtube.com/watch?v=abc123")).toBe("youtube");
    expect(detectPlatform("https://youtube.com/watch?v=xyz")).toBe("youtube");
  });

  test("YouTube short", () => {
    expect(detectPlatform("https://www.youtube.com/shorts/abc123")).toBe("youtube_short");
  });

  test("youtu.be shortlink → youtube", () => {
    expect(detectPlatform("https://youtu.be/abc123")).toBe("youtube");
  });

  test("Vimeo", () => {
    expect(detectPlatform("https://vimeo.com/123456789")).toBe("vimeo");
  });

  test("Pinterest", () => {
    expect(detectPlatform("https://www.pinterest.com/pin/123")).toBe("pinterest");
    expect(detectPlatform("https://pinterest.com/username/board")).toBe("pinterest");
  });

  test("direct MP4 link → video", () => {
    expect(detectPlatform("https://example.com/video.mp4")).toBe("video");
    expect(detectPlatform("https://example.com/clip.webm")).toBe("video");
    expect(detectPlatform("https://example.com/stream.m3u8")).toBe("video");
  });

  test("product pages → web", () => {
    expect(detectPlatform("https://www.wilson.com/products/tennis-dress")).toBe("web");
    expect(detectPlatform("https://www.allrecipes.com/recipe/chicken-pasta/")).toBe("web");
    expect(detectPlatform("https://shop.lululemon.com/p/align-pant")).toBe("web");
    expect(detectPlatform("https://www.amazon.com/dp/B08N5WRWNW")).toBe("web");
  });

  test("invalid URL → web (safe fallback)", () => {
    expect(detectPlatform("not-a-url")).toBe("web");
    expect(detectPlatform("")).toBe("web");
  });
});

// ─── platformToMediaFormat ────────────────────────────────────────────────────

describe("platformToMediaFormat — platform → display format", () => {
  const videoPlatforms: ReturnType<typeof detectPlatform>[] = ["tiktok", "youtube", "youtube_short", "vimeo", "video"];
  const socialPlatforms: ReturnType<typeof detectPlatform>[] = ["instagram", "instagram_reel", "pinterest"];

  for (const p of videoPlatforms) {
    test(`${p} → "Video"`, () => {
      expect(platformToMediaFormat(p)).toBe("Video");
    });
  }

  for (const p of socialPlatforms) {
    test(`${p} → "Social Post"`, () => {
      expect(platformToMediaFormat(p)).toBe("Social Post");
    });
  }

  test(`web → "Webpage"`, () => {
    expect(platformToMediaFormat("web")).toBe("Webpage");
  });
});

// ─── isVideoPlatform ──────────────────────────────────────────────────────────

describe("isVideoPlatform", () => {
  test("video platforms return true", () => {
    expect(isVideoPlatform("tiktok")).toBe(true);
    expect(isVideoPlatform("youtube")).toBe(true);
    expect(isVideoPlatform("youtube_short")).toBe(true);
    expect(isVideoPlatform("vimeo")).toBe(true);
    expect(isVideoPlatform("instagram_reel")).toBe(true);
    expect(isVideoPlatform("video")).toBe(true);
  });

  test("non-video platforms return false", () => {
    expect(isVideoPlatform("instagram")).toBe(false);
    expect(isVideoPlatform("pinterest")).toBe(false);
    expect(isVideoPlatform("web")).toBe(false);
  });
});

// ─── Taxonomy consistency ─────────────────────────────────────────────────────

describe("CONTENT_TYPES / SUBCATEGORY_TAXONOMY — structural consistency", () => {
  test("CONTENT_TYPES has exactly 12 types", () => {
    expect(CONTENT_TYPES.length).toBe(12);
  });

  test("SUBCATEGORY_TAXONOMY keys are all valid CONTENT_TYPES", () => {
    const validTypes = new Set(CONTENT_TYPES as readonly string[]);
    for (const key of Object.keys(SUBCATEGORY_TAXONOMY)) {
      expect(validTypes.has(key), `"${key}" is in SUBCATEGORY_TAXONOMY but not in CONTENT_TYPES`).toBe(true);
    }
  });

  test("every content type except Other has a subcategory list", () => {
    const covered = new Set(Object.keys(SUBCATEGORY_TAXONOMY));
    const missing = (CONTENT_TYPES as readonly string[]).filter((t) => t !== "Other" && !covered.has(t));
    expect(missing, `Content types missing subcategory taxonomy: ${missing.join(", ")}`).toHaveLength(0);
  });

  test("every subcategory list is non-empty", () => {
    for (const [type, subs] of Object.entries(SUBCATEGORY_TAXONOMY)) {
      expect(subs.length, `${type} has an empty subcategory list`).toBeGreaterThan(0);
    }
  });

  test("CATEGORIES includes all categories that contentTypeFromCategory maps", () => {
    const mappedCategories = [
      "Recipes", "Products", "Shopping Deals", "Fashion", "Home", "Travel",
      "Fitness", "Beauty", "Parenting", "Business Ideas", "Entertainment", "Videos", "Education",
    ];
    const catSet = new Set(CATEGORIES as readonly string[]);
    for (const cat of mappedCategories) {
      expect(catSet.has(cat), `"${cat}" used in contentTypeFromCategory but missing from CATEGORIES`).toBe(true);
    }
  });

  test("CATEGORIES contains Needs Review and Uncategorized", () => {
    const catSet = new Set(CATEGORIES as readonly string[]);
    expect(catSet.has("Needs Review")).toBe(true);
    expect(catSet.has("Uncategorized")).toBe(true);
  });
});
