export type UrlMetadata = {
  title: string | null;
  description: string | null;
  image: string | null;
  source: string | null;
  type: string | null;
  media_format: string | null;
  recipe_ingredients?: string[] | null;
  recipe_steps?: string[] | null;
  recipe_nutrition?: Record<string, unknown> | null;
};

const BLOCKED_OR_PLACEHOLDER = /^(auto-filled from the page.*|untitled|title|description|notes?|thumbnail image url|robot or human\??|are you a robot\??|access denied|just a moment|attention required|pardon our interruption|captcha|cloudflare)$/i;
const GENERIC_TITLES = /^(instagram|tiktok|pinterest|facebook|x|twitter|youtube|walmart\.com\s*\|\s*save money\. live better\.?|amazon\.com|target|etsy|shopify)$/i;

// ─── Image rejection / scoring ────────────────────────────────────────────────

const IMAGE_REJECT_RE = /(\b|[._\-/])(icon|favicon|logo|logotype|avatar|profile[-_]?pic|profile[-_]?photo|author|gravatar|header|footer|nav|sprite|spacer|placeholder|transparent|blank|pixel|1x1|tracking|badge|star[_-]?rating|separator|bullet|arrow|divider|decoration|banner|newsletter|ad[_-]|affiliate|checkout|cart|button|social[-_]?(icon|logo)|share[-_](icon|button))(\b|[._\-/])|\.gif(\?|$)/i;

export function isRejectedImageUrl(url: string): boolean {
  if (!url) return true;
  return IMAGE_REJECT_RE.test(url);
}

export function scoreImageCandidate(src: string, attrs: Record<string, string> = {}): number {
  if (!src) return -9999;
  if (isRejectedImageUrl(src)) return -9999;

  // Tiny tracked pixels via query params
  const qs = src.includes("?") ? src.split("?")[1].toLowerCase() : "";
  if (/(?:^|&)(?:w|width)=\d{1,2}(?:&|$)|(?:^|&)(?:h|height)=\d{1,2}(?:&|$)/.test(qs)) return -9999;
  if (/\/\d{1,2}x\d{1,2}\//.test(src)) return -9999; // tiny in path like /1x1/

  let score = 0;

  // URL pattern boosts — content images
  if (/product|recipe|item[-_]?image|main[-_]?image|hero|gallery|food|dish|meal|photo|featured/i.test(src)) score += 15;
  if (/cdn\.|images?\.|photos?\.|media\.|assets\./i.test(src)) score += 5;

  // Format preference: JPEG/WebP > PNG
  if (/\.(jpg|jpeg|webp)(\?|$)/i.test(src)) score += 5;
  else if (/\.png(\?|$)/i.test(src)) score += 2;

  // Dimension scoring from HTML attributes
  const w = parseInt(attrs.width || attrs["data-width"] || "0", 10);
  const h = parseInt(attrs.height || attrs["data-height"] || "0", 10);
  if ((w > 0 && w < 50) || (h > 0 && h < 50)) return -9999; // too small
  if (w >= 500 || h >= 500) score += 25;
  else if (w >= 300 || h >= 300) score += 15;
  else if (w >= 100 || h >= 100) score += 5;

  // class/id semantic signals
  const cls = ((attrs.class || "") + " " + (attrs.id || "")).toLowerCase();
  if (/product[-_]?image|main[-_]?image|hero[-_]?image|primary[-_]?image|gallery[-_]?image|recipe[-_]?image|feature[-_]?image|zoom[-_]?image/i.test(cls)) score += 20;
  if (/logo|avatar|profile|author|header|nav|icon|site[-_]?icon|brand[-_]?image/i.test(cls)) return -9999;

  // alt text: presence of a meaningful alt that isn't a logo/icon keyword = small boost
  const alt = (attrs.alt || "").toLowerCase();
  if (alt && alt.length > 3 && !/logo|icon|avatar|author|badge|divider|decoration/.test(alt)) score += 3;

  return score;
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function normalizeText(value: string | null | undefined): string | null {
  const cleaned = decodeEntities(String(value ?? ""))
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return cleaned || null;
}

export function isMeaningfulMetadataValue(value: string | null | undefined, url?: string): value is string {
  const cleaned = normalizeText(value);
  if (!cleaned || cleaned.length < 3) return false;
  if (BLOCKED_OR_PLACEHOLDER.test(cleaned)) return false;
  if (url && cleaned === url) return false;
  return true;
}

function isMeaningfulTitle(value: string | null | undefined, url: URL): value is string {
  if (!isMeaningfulMetadataValue(value, url.toString())) return false;
  const cleaned = normalizeText(value)!;
  return !GENERIC_TITLES.test(cleaned) && cleaned.toLowerCase() !== url.hostname.replace(/^www\./, "").toLowerCase();
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z][\w']*/g, (word) =>
    ["and", "or", "the", "a", "an", "for", "to", "of", "in", "on", "with"].includes(word)
      ? word
      : word.charAt(0).toUpperCase() + word.slice(1),
  ).replace(/^\w/, (c) => c.toUpperCase());
}

export function bestTitleFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const parts = url.pathname
      .split("/")
      .map((part) => decodeURIComponent(part).trim())
      .filter(Boolean);
    const isSkippable = (segment: string) =>
      /^\d{4,}$/.test(segment) ||
      /^[a-f0-9-]{16,}$/i.test(segment) ||
      /^(dp|gp|pin|reel|reels|video|videos|watch|shorts|status|ip|product|products|p|item|items|article|articles|post|posts|recipe|recipes|story|stories|news|blog|page|pages|en|us|en-us|index)$/i.test(segment);
    const productMarker = parts.findIndex((part) => ["ip", "product", "products", "p", "item"].includes(part.toLowerCase()));
    const ordered = (productMarker >= 0 ? parts.slice(productMarker + 1) : parts).filter((segment) => !isSkippable(segment));
    const ranked = ordered
      .map((segment) => segment.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[+_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\d{5,}\b/g, "").replace(/\s+/g, " ").trim())
      .filter((s) => s.length >= 4 && /[a-z]/i.test(s));
    ranked.sort((a, b) => b.length - a.length);
    const top = ranked[0];
    if (!top) return null;
    return top === top.toLowerCase() ? titleCase(top) : top;
  } catch {
    return null;
  }
}

// ─── HTML attribute parsing ───────────────────────────────────────────────────

function getAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag))) {
    attrs[match[1].toLowerCase()] = decodeEntities((match[2] ?? match[3] ?? match[4] ?? "").trim());
  }
  return attrs;
}

function pickMeta(html: string, names: string[]): string | null {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const tag of html.match(/<meta\s+[^>]*>/gi) ?? []) {
    const attrs = getAttrs(tag);
    const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (wanted.has(key) && attrs.content) return normalizeText(attrs.content);
  }
  return null;
}

function pickLink(html: string, rels: string[]): string | null {
  const wanted = rels.map((r) => r.toLowerCase());
  for (const tag of html.match(/<link\s+[^>]*>/gi) ?? []) {
    const attrs = getAttrs(tag);
    const rel = (attrs.rel || "").toLowerCase();
    if (wanted.some((r) => rel.split(/\s+/).includes(r)) && attrs.href) return attrs.href;
  }
  return null;
}

function pickTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? normalizeText(m[1])?.slice(0, 300) ?? null : null;
}

// ─── Recipe JSON-LD helpers ───────────────────────────────────────────────────

function parseRecipeInstructions(raw: unknown): string[] {
  if (typeof raw === "string") return raw.trim() ? [raw.trim()] : [];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): string[] => {
    if (typeof item === "string") return item.trim() ? [item.trim()] : [];
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      if (typeof obj.text === "string" && obj.text.trim()) return [obj.text.trim()];
      if (obj.itemListElement) return parseRecipeInstructions(obj.itemListElement);
    }
    return [];
  }).filter(Boolean);
}

function parseNutritionValue(val: unknown): number | null {
  if (val == null) return null;
  const m = String(val).match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

function parseRecipeNutrition(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const n = raw as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const cal = parseNutritionValue(n.calories);
  const prot = parseNutritionValue(n.proteinContent);
  const carb = parseNutritionValue(n.carbohydrateContent);
  const fat = parseNutritionValue(n.fatContent);
  if (cal !== null) result.calories_per_serving = cal;
  if (prot !== null) result.protein_g = prot;
  if (carb !== null) result.carbs_g = carb;
  if (fat !== null) result.fat_g = fat;
  return Object.keys(result).length > 0 ? result : null;
}

// ─── JSON-LD extraction (type-prioritized) ────────────────────────────────────

function flattenJsonLd(value: unknown): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (typeof value === "object") {
    const obj = value as any;
    return [obj, ...flattenJsonLd(obj["@graph"]), ...flattenJsonLd(obj.mainEntity), ...flattenJsonLd(obj.itemListElement)];
  }
  return [];
}

function parseJsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]+type=["'][^"']*ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    try { out.push(...flattenJsonLd(JSON.parse(decodeEntities(match[1]).trim()))); } catch {}
  }
  return out;
}

function readJsonImage(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value || null;
  if (Array.isArray(value)) {
    for (const v of value) { const r = readJsonImage(v); if (r) return r; }
    return null;
  }
  if (typeof value === "object") return value.url || value.contentUrl || value.thumbnailUrl || null;
  return null;
}

// Priority order: Product/Recipe types first, then editorial, then fallback
const JSON_LD_TYPE_PRIORITY: string[][] = [
  ["Product", "ProductGroup", "IndividualProduct"],
  ["Recipe"],
  ["Article", "NewsArticle", "BlogPosting", "TechArticle", "Review"],
  ["VideoObject"],
  ["ImageObject"],
  ["WebPage", "ItemPage", "CollectionPage", "AboutPage"],
];

export function pickJsonLd(html: string): Partial<UrlMetadata & { _method: string }> {
  const nodes = parseJsonLd(html);
  if (!nodes.length) return {};

  // Pass 0: dedicated Recipe extraction — captures full structured recipe data
  for (const node of nodes) {
    const nodeTypes: string[] = [node["@type"]].flat().map(String);
    if (!nodeTypes.some((t) => t === "Recipe" || t.endsWith("/Recipe"))) continue;

    const rawImage = readJsonImage(node.image || node.thumbnailUrl || node.primaryImageOfPage);
    const image = rawImage && !isRejectedImageUrl(rawImage) ? rawImage : null;
    const title = normalizeText(node.name || node.headline || node.title);
    const description = normalizeText(node.description || node.caption);
    const recipeIngredients: string[] = Array.isArray(node.recipeIngredient)
      ? node.recipeIngredient.filter((v: any) => typeof v === "string").map((v: string) => v.trim()).filter(Boolean)
      : [];
    const recipeSteps = parseRecipeInstructions(node.recipeInstructions);
    const recipeNutrition = parseRecipeNutrition(node.nutrition);

    if (title || description || recipeIngredients.length || recipeSteps.length) {
      console.log(`[url-metadata] json-ld: Recipe matched image=${image ?? "none"} ingredients=${recipeIngredients.length} steps=${recipeSteps.length}`);
      return {
        title, description, image, _method: "json-ld:Recipe",
        ...(recipeIngredients.length && { recipe_ingredients: recipeIngredients }),
        ...(recipeSteps.length && { recipe_steps: recipeSteps }),
        ...(recipeNutrition && { recipe_nutrition: recipeNutrition }),
      };
    }
  }

  // Pass 1: find highest-priority type that has an image
  for (const typeGroup of JSON_LD_TYPE_PRIORITY) {
    for (const wantedType of typeGroup) {
      for (const node of nodes) {
        const nodeTypes: string[] = [node["@type"]].flat().map(String);
        if (!nodeTypes.some((t) => t === wantedType || t.endsWith(`/${wantedType}`))) continue;
        const rawImage = readJsonImage(node.image || node.thumbnailUrl || node.primaryImageOfPage);
        const image = rawImage && !isRejectedImageUrl(rawImage) ? rawImage : null;
        const title = normalizeText(node.name || node.headline || node.title);
        const description = normalizeText(node.description || node.caption);
        if (image || title || description) {
          console.log(`[url-metadata] json-ld: matched type=${wantedType} image=${image ?? "none"}`);
          return { title, description, image, _method: `json-ld:${wantedType}` };
        }
      }
    }
  }

  // Pass 2: any node with usable image regardless of type
  for (const node of nodes) {
    const rawImage = readJsonImage(node.image || node.thumbnailUrl || node.primaryImageOfPage);
    const image = rawImage && !isRejectedImageUrl(rawImage) ? rawImage : null;
    if (image) {
      const nodeType = [node["@type"]].flat()[0] ?? "unknown";
      console.log(`[url-metadata] json-ld: generic fallback type=${nodeType} image=${image}`);
      return {
        title: normalizeText(node.name || node.headline || node.title),
        description: normalizeText(node.description || node.caption),
        image,
        _method: `json-ld:${nodeType}`,
      };
    }
  }

  // Pass 3: any node with title/description even without image
  for (const node of nodes) {
    const title = normalizeText(node.name || node.headline || node.title);
    const description = normalizeText(node.description || node.caption);
    if (title || description) return { title, description, image: null };
  }

  return {};
}

// ─── HTML image extraction (score-based) ─────────────────────────────────────

export function pickImageFromHtml(html: string, target: URL): string | null {
  const candidates: { url: string; score: number; method: string }[] = [];

  const push = (src: string | undefined, baseScore: number, attrs: Record<string, string>, method: string) => {
    if (!src) return;
    try {
      const abs = new URL(src.trim(), target).toString();
      const sc = scoreImageCandidate(abs, attrs) + baseScore;
      if (sc >= 0) candidates.push({ url: abs, score: sc, method });
    } catch {}
  };

  // 1. <link rel="image_src"> — intentional canonical image
  const linkSrc = pickLink(html, ["image_src"]);
  if (linkSrc) push(linkSrc, 10, {}, "link:image_src");

  // 2. Scan all <img> and <meta> tags
  for (const tag of html.match(/<(?:img|meta|link)\s+[^>]*>/gi) ?? []) {
    const attrs = getAttrs(tag);
    const tagName = tag.slice(1, 4).toLowerCase();
    const itemprop = (attrs.itemprop || "").toLowerCase();

    // itemprop="image" (HTML Microdata) — strong signal
    if (itemprop === "image") {
      const src = attrs.content || attrs.src || attrs.href;
      push(src, 20, attrs, "itemprop:image");
    }

    if (tagName === "img") {
      // Try all common lazy-load / zoom / high-res variants in priority order
      const srcs: [string | undefined, string][] = [
        [attrs["data-zoom-image"], "img:data-zoom-image"],
        [attrs["data-large-image"], "img:data-large-image"],
        [attrs["data-large_image"], "img:data-large_image"],
        [attrs["data-high-res-src"], "img:data-high-res-src"],
        [attrs["data-full-size-url"], "img:data-full-size-url"],
        [attrs["data-full-res-src"], "img:data-full-res-src"],
        [attrs.src, "img:src"],
        [attrs["data-src"], "img:data-src"],
        [attrs["data-lazy-src"], "img:data-lazy-src"],
        [attrs["data-original"], "img:data-original"],
        [attrs["data-url"], "img:data-url"],
        [attrs.srcset?.split(/[\s,]+/)[0], "img:srcset"],
      ];
      for (const [src, method] of srcs) {
        push(src, 0, attrs, method);
        // Only take the first non-empty src for this img tag
        // (but still let higher-resolution data-* attrs get higher base score)
      }
    }
  }

  // 3. Raw URL scan — catches JSON-embedded image URLs in <script> blocks
  const urlRe = /https?:\\?\/\\?\/[^"'\s<>\\]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>\\]*)?/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(html))) {
    const raw = m[0].replace(/\\\//g, "/").replace(/\\u002F/gi, "/");
    push(raw, -5, {}, "url:rawscan"); // slight penalty vs explicit tags
  }

  if (!candidates.length) return null;

  // Deduplicate (keep highest score per URL) and sort
  const byUrl = new Map<string, { score: number; method: string }>();
  for (const c of candidates) {
    const existing = byUrl.get(c.url);
    if (!existing || c.score > existing.score) byUrl.set(c.url, { score: c.score, method: c.method });
  }
  const sorted = Array.from(byUrl.entries())
    .sort((a, b) => b[1].score - a[1].score);

  if (sorted.length) {
    const [url, { score, method }] = sorted[0];
    console.log(`[url-metadata] html-scan: selected ${method} score=${score} url=${url}`);
    return url;
  }
  return null;
}

// ─── Type / format inference ──────────────────────────────────────────────────

export function inferType(url: string, ogType: string | null): string {
  const u = url.toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com|tiktok\.com/.test(u)) return "video";
  if (/instagram\.com|pinterest\.com/.test(u)) return "social";
  if (/amazon\.|shopify|etsy|ebay|walmart|target\.com/.test(u)) return "product";
  if (/allrecipes|foodnetwork|seriouseats|recipe|epicurious|bonappetit/.test(u)) return "recipe";
  if (ogType === "video" || ogType?.startsWith("video.")) return "video";
  if (ogType === "product" || ogType?.startsWith("product")) return "product";
  if (ogType === "article") return "article";
  return "link";
}

function inferMediaFormat(url: string, ogType: string | null): string {
  const u = url.toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com|tiktok\.com/.test(u)) return "Video";
  if (/instagram\.com|pinterest\.com/.test(u)) return "Social Post";
  if (/amazon\.|shopify|etsy|ebay|walmart|target\.com/.test(u)) return "Product Page";
  if (ogType === "video" || ogType?.startsWith("video.")) return "Video";
  if (ogType === "product" || ogType?.startsWith("product")) return "Product Page";
  if (ogType === "article") return "Article";
  return "Webpage";
}

function isBlockedPage(body: string): boolean {
  const title = pickTitle(body)?.toLowerCase() ?? "";
  if (/robot or human|are you a robot|access denied|just a moment|attention required|pardon our interruption|captcha|cloudflare|enable javascript and cookies/i.test(title)) return true;
  if (/robot or human|verify you are human|captcha|pardon our interruption/i.test(body.slice(0, 8000))) return true;
  return /<title[^>]*>\s*<\/title>/i.test(body) && body.length < 4000;
}

// ─── Streaming HTML read ──────────────────────────────────────────────────────

async function readHead(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const decoder = new TextDecoder();
  let body = "";
  let received = 0;
  const max = 1536 * 1024;
  while (received < max) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    body += decoder.decode(value, { stream: true });
    if (body.includes("</head>") && body.length > 20000) break;
  }
  try { await reader.cancel(); } catch {}
  return body;
}

// ─── oEmbed ───────────────────────────────────────────────────────────────────

async function tryOembed(target: URL, signal: AbortSignal): Promise<Partial<UrlMetadata> | null> {
  const host = target.hostname;
  let endpoint: string | null = null;
  if (/(^|\.)youtube\.com$/.test(host) || host === "youtu.be") endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(target.toString())}`;
  else if (/(^|\.)vimeo\.com$/.test(host)) endpoint = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(target.toString())}`;
  else if (/(^|\.)tiktok\.com$/.test(host)) endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(target.toString())}`;
  else if (/(^|\.)pinterest\.com$/.test(host)) endpoint = `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(target.toString())}`;
  if (!endpoint) return null;
  try {
    const res = await fetch(endpoint, { signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" } });
    if (!res.ok) return null;
    const json: any = await res.json();
    return { title: normalizeText(json.title), image: json.thumbnail_url || null, source: json.provider_name || null };
  } catch { return null; }
}

/** Retry oEmbed up to maxAttempts times with a per-attempt timeout of timeoutMs. */
async function tryOembedWithRetry(target: URL, maxAttempts: number, timeoutMs = 5000): Promise<Partial<UrlMetadata> | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const result = await tryOembed(target, ctrl.signal);
      if (result?.image) return result;
    } catch {} finally {
      clearTimeout(timer);
    }
    if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, 400 * (i + 1)));
  }
  return null;
}

// ─── Firecrawl ────────────────────────────────────────────────────────────────

async function tryFirecrawlRequest(target: URL, body: object, signal: AbortSignal): Promise<Partial<UrlMetadata> | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[Firecrawl metadata] HTTP", res.status, text);
    return null;
  }
  const raw: any = await res.json();
  const doc = raw.data ?? raw;
  const extracted = doc.extract ?? {};
  const metadata = doc.metadata ?? {};
  const html = doc.html ?? "";

  // Validate og:image from Firecrawl metadata
  const rawOgImage = metadata.ogImage || metadata.image;
  const fcOgImage = rawOgImage && !isRejectedImageUrl(rawOgImage) ? rawOgImage : null;

  const image = extracted.image_url && !isRejectedImageUrl(extracted.image_url)
    ? extracted.image_url
    : fcOgImage || (html ? pickImageFromHtml(html, target) : null);

  if (image) console.log(`[url-metadata] firecrawl image=${image}`);

  return {
    title: normalizeText(extracted.title || metadata.title || metadata.ogTitle),
    description: normalizeText(extracted.description || metadata.description || metadata.ogDescription),
    image: image || null,
    source: normalizeText(
      metadata.siteName ||
      (metadata.sourceURL ? new URL(metadata.sourceURL).hostname.replace(/^www\./, "") : null)
    ),
  };
}

async function tryFirecrawl(target: URL): Promise<Partial<UrlMetadata> | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const full = await tryFirecrawlRequest(target, {
      url: target.toString(),
      formats: ["extract", "html"],
      extract: {
        prompt: [
          "Extract the page title, a description, and the main content image URL.",
          "For product pages: return the PRIMARY PRODUCT PHOTO (the main gallery image showing the actual product), NOT the site logo, brand icon, or avatar.",
          "For recipe pages: return the MAIN FOOD PHOTO, NOT an author headshot, profile picture, or site logo.",
          "Reject any image that looks like a logo, icon, favicon, avatar, profile picture, banner ad, tracking pixel, or decoration.",
          "Return null for image_url if no suitable content image is found.",
        ].join(" "),
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            image_url: { type: "string", description: "Direct URL to the primary product/recipe/article image. Null if none found." },
            description: { type: "string" },
          },
        },
      },
      onlyMainContent: false,
      waitFor: 2000,
      location: { country: "US", languages: ["en"] },
    }, controller.signal);

    if (full?.image || full?.title) return full;

    // Lighter fallback: html only
    const html = await tryFirecrawlRequest(target, {
      url: target.toString(),
      formats: ["html"],
      onlyMainContent: false,
      waitFor: 1500,
      location: { country: "US", languages: ["en"] },
    }, controller.signal);

    return html;
  } catch (err) {
    console.warn("[Firecrawl metadata] error:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────

function absolutizeImage(image: string | null | undefined, target: URL): string | null {
  if (!image) return null;
  if (isRejectedImageUrl(image)) return null;
  try { return new URL(image, target).toString(); } catch { return null; }
}

const SCRAPER_BLOCKED_HOSTS = new Set(["bestbuy.com", "costco.com", "samsclub.com"]);

async function tryImageSearch(query: string): Promise<string | null> {
  try {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const searchRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=images&iax=images`, {
      headers: { "User-Agent": ua },
      signal: AbortSignal.timeout(8000),
    });
    const html = await searchRes.text();
    const vqdMatch = html.match(/vqd[=:]['"]([^'"]+)['"]/);
    if (!vqdMatch) return null;
    const imgRes = await fetch(`https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&s=0&u=bing&f=,,,,,&l=us-en&vqd=${vqdMatch[1]}`, {
      headers: { "User-Agent": ua, Referer: "https://duckduckgo.com/" },
      signal: AbortSignal.timeout(8000),
    });
    const json = await imgRes.json() as any;
    return (json.results?.[0]?.image as string) || null;
  } catch {
    return null;
  }
}

async function tryKnownCdnImage(target: URL): Promise<string | null> {
  const host = target.hostname.replace(/^www\./, "");
  const path = target.pathname;
  if (host === "bestbuy.com") {
    const m = path.match(/\/([A-Z0-9]{6,})\.[a-z]$/i) || path.match(/\/product\/[^/]+\/([A-Z0-9]{6,})$/i);
    if (m) {
      const id = m[1];
      const cdnUrl = `https://pisces.bbystatic.com/image2/BestBuy_US/images/products/${id.slice(0, 3)}/${id}_sd.jpg`;
      try {
        const head = await fetch(cdnUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) });
        const ct = head.headers.get("content-type") || "";
        if (head.ok && ct.includes("jpeg")) return cdnUrl;
      } catch {}
    }
  }
  return null;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function fetchMetadata(rawUrl: string): Promise<UrlMetadata> {
  const target = new URL(rawUrl);
  if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("Only http(s) URLs are supported");
  const hostSource = target.hostname.replace(/^www\./, "");
  const log = (msg: string) => console.log(`[url-metadata:${hostSource}] ${msg}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  const userAgents = [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Twitterbot/1.0",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  ];

  let html = "";
  let htmlScore = 0;
  let finalUrl: URL = target;
  for (const ua of userAgents) {
    try {
      const res = await fetch(target.toString(), {
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" },
      });
      if (!res.ok) continue;
      try { finalUrl = new URL(res.url || target.toString()); } catch {}
      const body = await readHead(res);
      if (!body || isBlockedPage(body)) continue;
      const score = (/<meta[^>]+(?:og:|twitter:)/i.test(body) ? 4 : 0) + (/<script[^>]+ld\+json/i.test(body) ? 3 : 0) + (/<img\s/i.test(body) ? 1 : 0);
      if (score > htmlScore) { html = body; htmlScore = score; if (score >= 7) break; }
    } catch {}
  }
  clearTimeout(timer);

  // ── Extract metadata from HTML ──────────────────────────────────────────────
  const jsonLd = html ? pickJsonLd(html) : {};
  const ogTitle = html ? pickMeta(html, ["og:title", "twitter:title", "title"]) : null;
  const docTitle = html ? pickTitle(html) : null;
  const description = html ? pickMeta(html, ["og:description", "twitter:description", "description"]) : null;
  const ogType = html ? pickMeta(html, ["og:type"]) : null;
  const siteName = html ? pickMeta(html, ["og:site_name", "application-name"]) : null;

  // ── Image extraction with priority and rejection ────────────────────────────

  // Validate og:image dimensions (reject tiny images)
  const ogImageWidth = html ? parseInt(pickMeta(html, ["og:image:width"]) || "0", 10) : 0;
  const ogImageHeight = html ? parseInt(pickMeta(html, ["og:image:height"]) || "0", 10) : 0;
  const isTinyOg = (ogImageWidth > 0 && ogImageWidth < 100) || (ogImageHeight > 0 && ogImageHeight < 100);

  const rawOgImage = html ? pickMeta(html, ["og:image:secure_url", "og:image:url", "og:image", "twitter:image", "twitter:image:src"]) : null;
  // TikTok api/img URLs are ephemeral and require auth when rendered in a browser — always reject them
  const isTikTokApiImg = !!rawOgImage && /tiktok\.com\/api\/img/i.test(rawOgImage);
  const ogImage = rawOgImage && !isRejectedImageUrl(rawOgImage) && !isTinyOg && !isTikTokApiImg ? rawOgImage : null;
  if (rawOgImage && !ogImage) log(`rejected og:image: ${rawOgImage} (${isTikTokApiImg ? "tiktok ephemeral api/img" : isTinyOg ? "tiny" : "bad url pattern"})`);
  if (ogImage) log(`candidate: og/twitter image = ${ogImage}`);

  const jsonLdImage = jsonLd.image && !isRejectedImageUrl(jsonLd.image) ? jsonLd.image : null;
  if (jsonLd.image && !jsonLdImage) log(`rejected json-ld image: ${jsonLd.image}`);
  if (jsonLdImage) log(`candidate: ${(jsonLd as any)._method ?? "json-ld"} image = ${jsonLdImage}`);

  const htmlImage = html ? pickImageFromHtml(html, target) : null;

  // Priority: og/twitter → JSON-LD (type-prioritized) → HTML scan
  const rawImage = ogImage || jsonLdImage || htmlImage;

  // TikTok oEmbed is the primary thumbnail source after api/img rejection — retry up to 3 times
  const isTikTokHost = /tiktok\.com/i.test(target.hostname);
  const oembed = (await tryOembedWithRetry(finalUrl, isTikTokHost ? 3 : 1)) ||
    (finalUrl.toString() !== target.toString() ? await tryOembedWithRetry(target, isTikTokHost ? 2 : 1) : null);
  if (oembed?.image) log(`oEmbed image: ${oembed.image}`);

  let result: UrlMetadata = {
    title: null,
    description: (isMeaningfulMetadataValue(description) ? description : jsonLd.description) || oembed?.description || null,
    image: absolutizeImage(rawImage || oembed?.image, target),
    source: siteName || oembed?.source || hostSource,
    type: inferType(target.toString(), ogType),
    media_format: inferMediaFormat(target.toString(), ogType),
  };
  result.title = isMeaningfulTitle(ogTitle, target) ? ogTitle
    : isMeaningfulTitle(jsonLd.title, target) ? jsonLd.title!
    : isMeaningfulTitle(docTitle, target) ? docTitle
    : oembed?.title || bestTitleFromUrl(target.toString());

  log(`after html pass: image=${result.image ?? "none"} title=${result.title ?? "none"}`);

  // ── Firecrawl fallback ──────────────────────────────────────────────────────
  if (!result.title || !result.description || !result.image) {
    const firecrawl = await tryFirecrawl(target);
    if (firecrawl) {
      result = {
        ...result,
        title: result.title || (isMeaningfulTitle(firecrawl.title, target) ? firecrawl.title! : null),
        description: result.description || (isMeaningfulMetadataValue(firecrawl.description) ? firecrawl.description! : null),
        image: result.image || absolutizeImage(firecrawl.image, target),
        source: result.source || firecrawl.source || hostSource,
      };
      if (!rawImage && result.image) log(`image found via firecrawl: ${result.image}`);
    }
  }

  // ── Blocked-host fallbacks ──────────────────────────────────────────────────
  if (!result.image && SCRAPER_BLOCKED_HOSTS.has(hostSource)) {
    result.image = await tryKnownCdnImage(target);
    if (!result.image) {
      const titleForSearch = result.title || bestTitleFromUrl(target.toString());
      if (titleForSearch) {
        result.image = await tryImageSearch(titleForSearch);
        if (result.image) log(`image found via image-search: ${result.image}`);
      }
    }
  } else if (!result.image) {
    result.image = await tryKnownCdnImage(target);
  }

  log(`FINAL: image=${result.image ?? "none"} | title=${result.title ?? "none"}`);

  return {
    title: result.title || bestTitleFromUrl(target.toString()) || hostSource,
    description: result.description ? result.description.slice(0, 1000) : null,
    image: result.image || null,
    source: result.source || hostSource,
    type: result.type || "link",
    media_format: result.media_format || "Webpage",
    ...(jsonLd.recipe_ingredients?.length && { recipe_ingredients: jsonLd.recipe_ingredients }),
    ...(jsonLd.recipe_steps?.length && { recipe_steps: jsonLd.recipe_steps }),
    ...(jsonLd.recipe_nutrition && { recipe_nutrition: jsonLd.recipe_nutrition }),
  };
}
