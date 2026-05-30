export type UrlMetadata = {
  title: string | null;
  description: string | null;
  image: string | null;
  source: string | null;
  type: string | null;
};

const BLOCKED_OR_PLACEHOLDER = /^(auto-filled from the page.*|untitled|title|description|notes?|thumbnail image url|robot or human\??|are you a robot\??|access denied|just a moment|attention required|pardon our interruption|captcha|cloudflare)$/i;
const GENERIC_TITLES = /^(instagram|tiktok|pinterest|facebook|x|twitter|youtube|walmart\.com\s*\|\s*save money\. live better\.?|amazon\.com|target|etsy|shopify)$/i;

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
    const productMarker = parts.findIndex((part) => ["ip", "product", "products", "p", "item"].includes(part.toLowerCase()));
    const candidates = productMarker >= 0 ? parts.slice(productMarker + 1) : parts;
    for (const segment of candidates) {
      if (/^\d{4,}$/.test(segment) || /^[a-f0-9-]{16,}$/i.test(segment)) continue;
      if (/^(dp|gp|pin|reel|reels|video|watch|shorts|status)$/i.test(segment)) continue;
      const cleaned = segment
        .replace(/\.[a-z0-9]{2,5}$/i, "")
        .replace(/[+_-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\d{5,}\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned.length >= 4 && /[a-z]/i.test(cleaned)) {
        return cleaned === cleaned.toLowerCase() ? titleCase(cleaned) : cleaned;
      }
    }
    return null;
  } catch {
    return null;
  }
}

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
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(readJsonImage).find(Boolean) ?? null;
  if (typeof value === "object") return value.url || value.contentUrl || value.thumbnailUrl || null;
  return null;
}

function pickJsonLd(html: string): Partial<UrlMetadata> {
  const nodes = parseJsonLd(html);
  for (const node of nodes) {
    const title = normalizeText(node.name || node.headline || node.title);
    const description = normalizeText(node.description || node.caption);
    const image = readJsonImage(node.image || node.thumbnailUrl || node.primaryImageOfPage);
    if (title || description || image) return { title, description, image };
  }
  return {};
}

function pickImageFromHtml(html: string, target: URL): string | null {
  const fromLink = pickLink(html, ["image_src"]);
  if (fromLink) return fromLink;
  const urls = new Set<string>();
  for (const tag of html.match(/<img\s+[^>]*>/gi) ?? []) {
    const attrs = getAttrs(tag);
    const src = attrs.src || attrs["data-src"] || attrs["data-original"] || attrs.srcset?.split(/[\s,]+/)[0];
    if (src) urls.add(src);
  }
  const re = /https?:\\?\/\\?\/[^"'\s<>\\]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>\\]*)?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) urls.add(match[0].replace(/\\\//g, "/").replace(/\\u002F/gi, "/"));
  for (const raw of urls) {
    if (/sprite|favicon|logo|placeholder|transparent|blank/i.test(raw)) continue;
    try { return new URL(raw, target).toString(); } catch {}
  }
  return null;
}

function inferType(url: string, ogType: string | null): string {
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

function isBlockedPage(body: string): boolean {
  const title = pickTitle(body)?.toLowerCase() ?? "";
  if (/robot or human|are you a robot|access denied|just a moment|attention required|pardon our interruption|captcha|cloudflare|enable javascript and cookies/i.test(title)) return true;
  if (/robot or human|verify you are human|captcha|pardon our interruption/i.test(body.slice(0, 8000))) return true;
  return /<title[^>]*>\s*<\/title>/i.test(body) && body.length < 4000;
}

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

async function tryFirecrawl(target: URL): Promise<Partial<UrlMetadata> | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: target.toString(),
        formats: [{ type: "json", prompt: "Extract the saved item's exact page title, a direct thumbnail image URL, and a concise note/description. Return null for unknown fields." }, "html", "summary"],
        onlyMainContent: false,
        waitFor: 1200,
        location: { country: "US", languages: ["en"] },
      }),
    });
    if (!res.ok) return null;
    const raw: any = await res.json();
    const doc = raw.data ?? raw;
    const extracted = doc.json ?? {};
    const metadata = doc.metadata ?? {};
    const html = doc.html ?? "";
    return {
      title: normalizeText(extracted.title || extracted.name || metadata.title),
      description: normalizeText(extracted.notes || extracted.description || doc.summary || metadata.description),
      image: extracted.image_url || extracted.image || extracted.thumbnail_url || metadata.ogImage || metadata.image || pickImageFromHtml(html, target),
      source: normalizeText(metadata.siteName || metadata.sourceURL ? new URL(metadata.sourceURL || target.toString()).hostname.replace(/^www\./, "") : null),
    };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function absolutizeImage(image: string | null | undefined, target: URL): string | null {
  if (!image) return null;
  try { return new URL(image, target).toString(); } catch { return null; }
}

export async function fetchMetadata(rawUrl: string): Promise<UrlMetadata> {
  const target = new URL(rawUrl);
  if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("Only http(s) URLs are supported");
  const hostSource = target.hostname.replace(/^www\./, "");
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
  for (const ua of userAgents) {
    try {
      const res = await fetch(target.toString(), {
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" },
      });
      if (!res.ok) continue;
      const body = await readHead(res);
      if (!body || isBlockedPage(body)) continue;
      const score = (/<meta[^>]+(?:og:|twitter:)/i.test(body) ? 4 : 0) + (/<script[^>]+ld\+json/i.test(body) ? 3 : 0) + (/<img\s/i.test(body) ? 1 : 0);
      if (score > htmlScore) {
        html = body;
        htmlScore = score;
        if (score >= 7) break;
      }
    } catch {}
  }
  clearTimeout(timer);

  const jsonLd = html ? pickJsonLd(html) : {};
  const ogTitle = html ? pickMeta(html, ["og:title", "twitter:title", "title"]) : null;
  const docTitle = html ? pickTitle(html) : null;
  const description = html ? pickMeta(html, ["og:description", "twitter:description", "description"]) : null;
  const ogType = html ? pickMeta(html, ["og:type"]) : null;
  const siteName = html ? pickMeta(html, ["og:site_name", "application-name"]) : null;
  const image = html ? pickMeta(html, ["og:image:secure_url", "og:image:url", "og:image", "twitter:image", "twitter:image:src", "thumbnail"]) || jsonLd.image || pickImageFromHtml(html, target) : null;
  const oembed = await tryOembed(target, new AbortController().signal);

  let result: UrlMetadata = {
    title: null,
    description: (isMeaningfulMetadataValue(description) ? description : jsonLd.description) || oembed?.description || null,
    image: absolutizeImage(image || oembed?.image, target),
    source: siteName || oembed?.source || hostSource,
    type: inferType(target.toString(), ogType),
  };
  result.title = isMeaningfulTitle(ogTitle, target) ? ogTitle : isMeaningfulTitle(jsonLd.title, target) ? jsonLd.title! : isMeaningfulTitle(docTitle, target) ? docTitle : oembed?.title || bestTitleFromUrl(target.toString());

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
    }
  }

  const fallbackImage = result.image || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostSource)}&sz=128`;
  return {
    title: result.title || bestTitleFromUrl(target.toString()) || hostSource,
    description: result.description ? result.description.slice(0, 1000) : null,
    image: fallbackImage,
    source: result.source || hostSource,
    type: result.type || "link",
  };
}