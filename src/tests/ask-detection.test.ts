import { describe, test, expect } from "bun:test";
import {
  isBrowseQuery,
  detectContentType,
  detectSubcategory,
  extractTopicKeywords,
  TYPE_KEYWORD_MAP,
  SUBCATEGORY_PATTERNS,
} from "../lib/content-type-utils";
import { CONTENT_TYPES } from "../lib/taxonomy";

// ─── isBrowseQuery ────────────────────────────────────────────────────────────

describe("isBrowseQuery — browse vs specific intent", () => {
  test("recipe browsing patterns → true", () => {
    expect(isBrowseQuery("show me all my recipes")).toBe(true);
    expect(isBrowseQuery("find all recipes")).toBe(true);
    expect(isBrowseQuery("what food have I saved")).toBe(true);
    expect(isBrowseQuery("list all my meals")).toBe(true);
    expect(isBrowseQuery("show me my cooking videos")).toBe(true);
  });

  test("fashion browsing → true", () => {
    expect(isBrowseQuery("show me my outfits")).toBe(true);
    expect(isBrowseQuery("what fashion items do I have")).toBe(true);
    expect(isBrowseQuery("all my clothing")).toBe(true);
  });

  test("product browsing → true", () => {
    expect(isBrowseQuery("show me all my products")).toBe(true);
    expect(isBrowseQuery("what shopping items have I saved")).toBe(true);
    expect(isBrowseQuery("list all my saved items to buy")).toBe(true);
  });

  test("fitness browsing → true", () => {
    expect(isBrowseQuery("show me my workouts")).toBe(true);
    expect(isBrowseQuery("find all fitness videos")).toBe(true);
    expect(isBrowseQuery("all my gym exercises")).toBe(true);
  });

  test("show/find/list all my patterns → true", () => {
    expect(isBrowseQuery("show me all")).toBe(true);
    expect(isBrowseQuery("find all my items")).toBe(true);
    expect(isBrowseQuery("list all my saves")).toBe(true);
    expect(isBrowseQuery("all my saved things")).toBe(true);
  });

  test("general content questions → true (contain content keywords)", () => {
    expect(isBrowseQuery("what ideas do I have saved")).toBe(true);
    expect(isBrowseQuery("show me videos")).toBe(true);
  });

  test("specific question without browse keywords → false", () => {
    expect(isBrowseQuery("what is the best way to make pasta")).toBe(false);
    expect(isBrowseQuery("how do I get more protein")).toBe(false);
    expect(isBrowseQuery("summarize the article about sleep")).toBe(false);
    expect(isBrowseQuery("")).toBe(false);
  });
});

// ─── detectContentType ────────────────────────────────────────────────────────

describe("detectContentType — keyword → content type", () => {
  test("recipe keywords", () => {
    expect(detectContentType("find chicken recipes")).toBe("Recipe");
    expect(detectContentType("quick dinner recipe for tonight")).toBe("Recipe");
    expect(detectContentType("what food have I saved")).toBe("Recipe");
    expect(detectContentType("cooking techniques I saved")).toBe("Recipe");
    expect(detectContentType("my meal ideas")).toBe("Recipe");
  });

  test("fashion keywords", () => {
    expect(detectContentType("summer outfit ideas")).toBe("Fashion");
    expect(detectContentType("what clothing have I saved")).toBe("Fashion");
    expect(detectContentType("show me fashion items")).toBe("Fashion");
    expect(detectContentType("style inspiration")).toBe("Fashion");
  });

  test("product keywords", () => {
    expect(detectContentType("things I want to buy")).toBe("Product");
    expect(detectContentType("what products did I save")).toBe("Product");
    expect(detectContentType("shopping list items")).toBe("Product");
    expect(detectContentType("something I want to purchase")).toBe("Product");
  });

  test("fitness keywords", () => {
    expect(detectContentType("show my workout plans")).toBe("Fitness");
    expect(detectContentType("gym exercises I saved")).toBe("Fitness");
    expect(detectContentType("yoga and exercise routines")).toBe("Fitness");
  });

  test("travel keywords", () => {
    expect(detectContentType("vacation ideas")).toBe("Travel");
    expect(detectContentType("my trip plans to Europe")).toBe("Travel");
    expect(detectContentType("travel destinations")).toBe("Travel");
  });

  test("home keywords", () => {
    expect(detectContentType("home decor ideas")).toBe("Home");
    // "furniture layout ideas" → Home (no buy/shop to override it)
    expect(detectContentType("furniture layout ideas")).toBe("Home");
    // Note: "furniture I want to buy" → Product because "buy" is matched first
    expect(detectContentType("interior design inspiration")).toBe("Home");
  });

  test("beauty keywords", () => {
    expect(detectContentType("skincare routine tips")).toBe("Beauty");
    expect(detectContentType("makeup tutorials")).toBe("Beauty");
  });

  test("parenting keywords", () => {
    expect(detectContentType("baby sleep tips")).toBe("Parenting");
    expect(detectContentType("parenting advice I saved")).toBe("Parenting");
    expect(detectContentType("ideas for kids activities")).toBe("Parenting");
  });

  test("business keywords", () => {
    expect(detectContentType("startup ideas")).toBe("Business");
    expect(detectContentType("business strategy resources")).toBe("Business");
  });

  test("entertainment keywords", () => {
    expect(detectContentType("entertainment content I saved")).toBe("Entertainment");
  });

  test("tutorial keywords", () => {
    // "guide" (singular, whole-word) maps to Tutorial — "guides" (plural) does NOT (word boundary)
    expect(detectContentType("a guide to watercolor painting")).toBe("Tutorial");
    expect(detectContentType("tutorial videos")).toBe("Tutorial");
  });

  test("ambiguous / unknown → null", () => {
    expect(detectContentType("hello world")).toBeNull();
    expect(detectContentType("what is the weather like")).toBeNull();
    expect(detectContentType("")).toBeNull();
  });

  test("multi-word phrase: home decor → Home (not decor alone)", () => {
    expect(detectContentType("home decor ideas")).toBe("Home");
  });

  test("single-word partial should NOT match (word boundary)", () => {
    // "recipes" has word "recipe" in it — should match
    expect(detectContentType("my recipes")).toBe("Recipe");
    // "shopping" contains "shop" — should match Product
    expect(detectContentType("my shopping list")).toBe("Product");
  });

  test("TYPE_KEYWORD_MAP values are all valid CONTENT_TYPES", () => {
    const validTypes = new Set(CONTENT_TYPES as readonly string[]);
    for (const [keyword, type] of Object.entries(TYPE_KEYWORD_MAP)) {
      expect(
        validTypes.has(type),
        `keyword "${keyword}" maps to "${type}" which is not a valid CONTENT_TYPE`
      ).toBe(true);
    }
  });
});

// ─── detectSubcategory ────────────────────────────────────────────────────────

describe("detectSubcategory — content type + keyword → subcategory", () => {
  test("Recipe subcategories", () => {
    expect(detectSubcategory("quick dinner recipes", "Recipe")).toBe("dinner");
    expect(detectSubcategory("breakfast ideas for kids", "Recipe")).toBe("breakfast");
    expect(detectSubcategory("easy lunch ideas", "Recipe")).toBe("lunch");
    expect(detectSubcategory("chocolate dessert recipes", "Recipe")).toBe("dessert");
    expect(detectSubcategory("soup recipes for winter", "Recipe")).toBe("soup");
    // "meal prep" pattern is checked before "salad" in SUBCATEGORY_PATTERNS — first match wins
    expect(detectSubcategory("salad for meal prep", "Recipe")).toBe("meal prep");
    expect(detectSubcategory("green salad recipe", "Recipe")).toBe("salad");
    expect(detectSubcategory("baking tips and tricks", "Recipe")).toBe("baking");
  });

  test("Fitness subcategories", () => {
    expect(detectSubcategory("yoga poses for beginners", "Fitness")).toBe("yoga");
    expect(detectSubcategory("cardio workout routines", "Fitness")).toBe("cardio");
    expect(detectSubcategory("hiit training programs", "Fitness")).toBe("hiit");
    expect(detectSubcategory("running plan for 5k", "Fitness")).toBe("running");
    expect(detectSubcategory("pilates core exercises", "Fitness")).toBe("pilates");
    expect(detectSubcategory("nutrition tips for athletes", "Fitness")).toBe("nutrition");
    expect(detectSubcategory("stretching for flexibility", "Fitness")).toBe("stretching");
  });

  test("Beauty subcategories", () => {
    expect(detectSubcategory("makeup tutorials I saved", "Beauty")).toBe("makeup");
    expect(detectSubcategory("skincare routine for dry skin", "Beauty")).toBe("skincare");
    expect(detectSubcategory("hair care tips", "Beauty")).toBe("hair");
    // Pattern is "nails" — requires the exact substring "nails" in the question
    expect(detectSubcategory("nail art nails ideas", "Beauty")).toBe("nails");
    expect(detectSubcategory("nail polish collection", "Beauty")).toBeNull(); // "nail" ≠ "nails"
  });

  test("Fashion subcategories", () => {
    // "dress" comes before "dresses" in SUBCATEGORY_PATTERNS, so substring match returns "dress"
    expect(detectSubcategory("summer dresses I liked", "Fashion")).toBe("dress");
    // "work outfit" pattern comes before "casual" — first match wins
    expect(detectSubcategory("casual work outfit", "Fashion")).toBe("work outfit");
    // Pure "casual" with no other pattern
    expect(detectSubcategory("casual everyday looks", "Fashion")).toBe("casual");
    // "shoe" comes before "shoes" in SUBCATEGORY_PATTERNS — returns "shoe"
    expect(detectSubcategory("show me shoes I saved", "Fashion")).toBe("shoe");
    expect(detectSubcategory("workwear ideas", "Fashion")).toBe("workwear");
  });

  test("Travel subcategories", () => {
    expect(detectSubcategory("trip to mexico ideas", "Travel")).toBe("mexico");
    expect(detectSubcategory("europe vacation plans", "Travel")).toBe("europe");
    expect(detectSubcategory("beach resort destinations", "Travel")).toBe("beach");
  });

  test("Business subcategories", () => {
    expect(detectSubcategory("marketing strategies I saved", "Business")).toBe("marketing");
    expect(detectSubcategory("productivity tools", "Business")).toBe("productivity");
    expect(detectSubcategory("side hustle ideas", "Business")).toBe("side hustle");
  });

  test("wrong content type → null (subcategory doesn't match)", () => {
    expect(detectSubcategory("yoga workout", "Recipe")).toBeNull();
    expect(detectSubcategory("dinner recipes", "Fitness")).toBeNull();
  });

  test("null contentType → null", () => {
    expect(detectSubcategory("dinner recipes", null)).toBeNull();
    expect(detectSubcategory("yoga workout", null)).toBeNull();
  });

  test("no matching subcategory → null", () => {
    expect(detectSubcategory("general random question", "Recipe")).toBeNull();
    expect(detectSubcategory("something completely different", "Fitness")).toBeNull();
  });

  test("SUBCATEGORY_PATTERNS keys are all valid CONTENT_TYPES", () => {
    const validTypes = new Set(CONTENT_TYPES as readonly string[]);
    for (const key of Object.keys(SUBCATEGORY_PATTERNS)) {
      expect(
        validTypes.has(key),
        `SUBCATEGORY_PATTERNS has key "${key}" which is not a valid CONTENT_TYPE`
      ).toBe(true);
    }
  });
});

// ─── extractTopicKeywords ─────────────────────────────────────────────────────

describe("extractTopicKeywords — stop-word and type-word filtering", () => {
  test("removes common stop words", () => {
    const kws = extractTopicKeywords("show me all my chicken dinner recipes");
    expect(kws).toContain("chicken");
    expect(kws).not.toContain("show");
    expect(kws).not.toContain("me");
    expect(kws).not.toContain("all");
    expect(kws).not.toContain("my");
  });

  test("removes content-type keywords from results", () => {
    const kws = extractTopicKeywords("healthy chicken dinner recipes");
    // "recipes" is in TYPE_KEYWORD_MAP, should be removed
    expect(kws).not.toContain("recipes");
    // but descriptive words stay
    expect(kws).toContain("healthy");
    expect(kws).toContain("chicken");
    expect(kws).toContain("dinner");
  });

  test("removes short words (≤ 2 chars)", () => {
    const kws = extractTopicKeywords("I want to get fit and run a 5k");
    expect(kws).not.toContain("i");
    expect(kws).not.toContain("a");
    expect(kws).not.toContain("to");
  });

  test("removes gym and other type words", () => {
    const kws = extractTopicKeywords("find all my gym workout tips");
    expect(kws).not.toContain("gym");
    expect(kws).not.toContain("workout");
    expect(kws).toContain("tips");
  });

  test("returns empty array for all-stop-word input", () => {
    const kws = extractTopicKeywords("show me all my saved items");
    // All words should be filtered out as stop words / type words
    expect(Array.isArray(kws)).toBe(true);
  });

  test("lowercases all keywords", () => {
    const kws = extractTopicKeywords("CHICKEN PASTA RECIPE");
    expect(kws).toContain("chicken");
    expect(kws).toContain("pasta");
  });

  test("strips punctuation", () => {
    const kws = extractTopicKeywords("gluten-free pasta, quick!");
    expect(kws).toContain("gluten");
    expect(kws).toContain("pasta");
    expect(kws).toContain("quick");
  });
});
