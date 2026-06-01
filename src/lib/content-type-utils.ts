import { SUBCATEGORY_TAXONOMY } from "./taxonomy";

export type SourcePlatform =
  | "tiktok"
  | "instagram_reel"
  | "instagram"
  | "youtube_short"
  | "youtube"
  | "vimeo"
  | "pinterest"
  | "video"
  | "web";

export function detectPlatform(rawUrl: string): SourcePlatform {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.toLowerCase();
    if (host.endsWith("tiktok.com")) return "tiktok";
    if (host.endsWith("instagram.com")) {
      if (/\/(reel|reels)\//.test(path)) return "instagram_reel";
      return "instagram";
    }
    if (host.endsWith("youtube.com") || host === "youtu.be") {
      if (/\/shorts\//.test(path)) return "youtube_short";
      return "youtube";
    }
    if (host.endsWith("vimeo.com")) return "vimeo";
    if (host.endsWith("pinterest.com")) return "pinterest";
    if (/\.(mp4|mov|webm|m3u8)(\?|$)/.test(path)) return "video";
    return "web";
  } catch {
    return "web";
  }
}

export function isVideoPlatform(p: SourcePlatform): boolean {
  return (
    p === "tiktok" || p === "instagram_reel" || p === "youtube_short" ||
    p === "youtube" || p === "vimeo" || p === "video"
  );
}

export function platformToMediaFormat(platform: SourcePlatform): string {
  if (
    platform === "tiktok" || platform === "youtube" || platform === "youtube_short" ||
    platform === "vimeo" || platform === "video"
  ) return "Video";
  if (platform === "instagram_reel" || platform === "instagram" || platform === "pinterest") return "Social Post";
  return "Webpage";
}

export function contentTypeFromCategory(category: string): string {
  const map: Record<string, string> = {
    "Recipes":        "Recipe",
    "Products":       "Product",
    "Shopping Deals": "Product",
    "Fashion":        "Fashion",
    "Home":           "Home",
    "Travel":         "Travel",
    "Fitness":        "Fitness",
    "Beauty":         "Beauty",
    "Parenting":      "Parenting",
    "Business Ideas": "Business",
    "Entertainment":  "Entertainment",
    "Videos":         "Entertainment",
    "Education":      "Tutorial",
  };
  return map[category] ?? "Other";
}

// ─── Browse Intent Detection ──────────────────────────────────────────────────

export const BROWSE_PATTERNS = [
  /\b(recipe|recipes|food|meal|meals|dish|dishes|cook|cooking)\b/i,
  /\b(outfit|outfits|fashion|style|looks?|wear|clothing|clothes)\b/i,
  /\b(product|products|buy|purchase|shop|shopping)\b/i,
  /\b(home\s+idea|home\s+decor|decor|interior|furniture|room)\b/i,
  /\b(travel\s+idea|travel|trip|vacation|destination)\b/i,
  /\b(tutorial|guide|how\s*to|how-to|lesson)\b/i,
  /\bideas?\b/i,
  /\b(fitness|workout|exercise|gym)\b/i,
  /\b(beauty|skincare|makeup)\b/i,
  /\b(entertainment|video|videos)\b/i,
  /\b(business|startup)\b/i,
  /\b(parenting|kids|baby|children)\b/i,
  /\bshow\s+(me\s+)?(all|every|my)/i,
  /\bfind\s+(all|every|my)/i,
  /\blist\s+(all|my|every)/i,
  /\bwhat\s+.*(have\s+i\s+saved|i'?ve?\s+saved|saved)/i,
  /\ball\s+my\b/i,
];

export function isBrowseQuery(question: string): boolean {
  return BROWSE_PATTERNS.some((p) => p.test(question));
}

// ─── Content-Type Detection ───────────────────────────────────────────────────

export const TYPE_KEYWORD_MAP: Record<string, string> = {
  recipe: "Recipe", recipes: "Recipe", food: "Recipe", meal: "Recipe", meals: "Recipe",
  dish: "Recipe", dishes: "Recipe", cooking: "Recipe",
  outfit: "Fashion", outfits: "Fashion", fashion: "Fashion",
  style: "Fashion", clothing: "Fashion", clothes: "Fashion",
  product: "Product", products: "Product", buy: "Product", purchase: "Product",
  shopping: "Product", shop: "Product",
  "home idea": "Home", "home decor": "Home", decor: "Home",
  interior: "Home", furniture: "Home", "home design": "Home",
  travel: "Travel", trip: "Travel", vacation: "Travel", destination: "Travel",
  tutorial: "Tutorial", guide: "Tutorial",
  fitness: "Fitness", workout: "Fitness", exercise: "Fitness", gym: "Fitness",
  beauty: "Beauty", skincare: "Beauty", makeup: "Beauty",
  entertainment: "Entertainment",
  business: "Business", startup: "Business",
  parenting: "Parenting", kids: "Parenting", baby: "Parenting",
};

export function detectContentType(question: string): string | null {
  const lower = question.toLowerCase();
  for (const [kw, type] of Object.entries(TYPE_KEYWORD_MAP)) {
    if (kw.includes(" ") && lower.includes(kw)) return type;
  }
  for (const [kw, type] of Object.entries(TYPE_KEYWORD_MAP)) {
    if (!kw.includes(" ") && new RegExp(`\\b${kw}\\b`).test(lower)) return type;
  }
  return null;
}

// ─── Subcategory Detection ────────────────────────────────────────────────────

export const SUBCATEGORY_PATTERNS: Record<string, string[]> = {
  Recipe:    ["breakfast", "lunch", "dinner", "dessert", "snack", "drink", "smoothie", "meal prep", "salad", "soup", "baking", "sides"],
  Fashion:   ["dress", "dresses", "shoe", "shoes", "workwear", "work outfit", "vacation outfit", "beach outfit", "activewear", "jewelry", "accessories", "jeans", "pants", "tops", "casual"],
  Product:   ["electronics", "kitchen", "appliance", "skincare", "home decor", "fitness gear", "clothing", "gifts"],
  Travel:    ["mexico", "europe", "asia", "caribbean", "beach", "resort", "weekend trip", "restaurant", "activities"],
  Fitness:   ["strength", "cardio", "yoga", "hiit", "running", "pilates", "stretching", "nutrition"],
  Beauty:    ["skincare", "makeup", "hair", "nails", "fragrance", "body care"],
  Business:  ["marketing", "finance", "productivity", "side hustle", "ecommerce", "social media", "branding"],
};

export function detectSubcategory(question: string, contentType: string | null): string | null {
  if (!contentType) return null;
  const lower = question.toLowerCase();
  const patterns = SUBCATEGORY_PATTERNS[contentType] ?? [];
  for (const pat of patterns) {
    if (lower.includes(pat)) return pat;
  }
  return null;
}

// ─── Topic Keyword Extraction ─────────────────────────────────────────────────

export const STOP_WORDS = new Set([
  "what", "have", "ive", "i've", "saved", "show", "me", "find", "all", "my", "the", "a",
  "an", "for", "with", "about", "items", "things", "do", "get", "is", "are", "was", "in",
  "on", "at", "to", "of", "and", "or", "that", "this", "from", "by", "any", "some", "most",
  "more", "which", "can", "could", "would", "should", "using", "use", "save", "stash",
  "ideas", "idea", "saved", "ever", "list", "every", "each", "across",
]);

export function extractTopicKeywords(question: string): string[] {
  const typeWords = new Set(Object.keys(TYPE_KEYWORD_MAP).filter((k) => !k.includes(" ")));
  return question
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !typeWords.has(w));
}

// ─── Subcategory taxonomy (re-export for convenience) ─────────────────────────
export { SUBCATEGORY_TAXONOMY };
