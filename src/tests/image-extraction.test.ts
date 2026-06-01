import { describe, test, expect } from "bun:test";
import {
  isRejectedImageUrl,
  scoreImageCandidate,
  pickImageFromHtml,
  pickJsonLd,
  inferType,
} from "../lib/url-metadata.server";

// ─── isRejectedImageUrl ───────────────────────────────────────────────────────

describe("isRejectedImageUrl — rejects bad images", () => {
  test("rejects logo URLs", () => {
    expect(isRejectedImageUrl("https://example.com/logo.png")).toBe(true);
    expect(isRejectedImageUrl("https://example.com/images/site-logo.svg")).toBe(true);
    expect(isRejectedImageUrl("https://cdn.example.com/brand-logotype.png")).toBe(true);
    expect(isRejectedImageUrl("https://example.com/header-logo.jpg")).toBe(true);
  });

  test("rejects favicon and icon URLs", () => {
    expect(isRejectedImageUrl("https://example.com/favicon.ico")).toBe(true);
    expect(isRejectedImageUrl("https://example.com/favicon-32x32.png")).toBe(true);
    expect(isRejectedImageUrl("https://example.com/apple-touch-icon.png")).toBe(true);
    expect(isRejectedImageUrl("https://example.com/images/icon-cart.png")).toBe(true);
  });

  test("rejects avatar and profile picture URLs", () => {
    expect(isRejectedImageUrl("https://example.com/avatar.jpg")).toBe(true);
    expect(isRejectedImageUrl("https://example.com/profile-pic.jpg")).toBe(true);
    expect(isRejectedImageUrl("https://example.com/author/gravatar.png")).toBe(true);
    expect(isRejectedImageUrl("https://example.com/user-profile-photo.jpg")).toBe(true);
  });

  test("rejects tracking pixels and spacers", () => {
    expect(isRejectedImageUrl("https://track.example.com/pixel.gif")).toBe(true);
    expect(isRejectedImageUrl("https://example.com/spacer.gif")).toBe(true);
    expect(isRejectedImageUrl("https://example.com/images/1x1.png")).toBe(true);
    expect(isRejectedImageUrl("https://example.com/tracking-pixel.gif")).toBe(true);
  });

  test("rejects GIFs (usually decorative/animated)", () => {
    expect(isRejectedImageUrl("https://example.com/animation.gif")).toBe(true);
    expect(isRejectedImageUrl("https://cdn.site.com/banner.gif")).toBe(true);
  });

  test("rejects navigation and sprite images", () => {
    expect(isRejectedImageUrl("https://example.com/nav-arrow.png")).toBe(true);
    expect(isRejectedImageUrl("https://example.com/ui-sprite.png")).toBe(true);
    expect(isRejectedImageUrl("https://example.com/header-bg.jpg")).toBe(true);
  });

  test("allows product images", () => {
    expect(isRejectedImageUrl("https://cdn.shop.com/products/tennis-dress-front.jpg")).toBe(false);
    expect(isRejectedImageUrl("https://images.example.com/product/watch-1234.webp")).toBe(false);
    expect(isRejectedImageUrl("https://cdn.example.com/hero-image.jpeg")).toBe(false);
  });

  test("allows recipe and food images", () => {
    expect(isRejectedImageUrl("https://cdn.allrecipes.com/recipe/chicken-pasta.jpg")).toBe(false);
    expect(isRejectedImageUrl("https://images.food52.com/photo/roasted-chicken.webp")).toBe(false);
  });

  test("allows CDN images with neutral filenames", () => {
    expect(isRejectedImageUrl("https://media.example.com/img/photo-main-1200.jpg")).toBe(false);
    expect(isRejectedImageUrl("https://assets.store.com/uploads/2024/05/image.jpg")).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isRejectedImageUrl("")).toBe(true);
  });
});

// ─── scoreImageCandidate ──────────────────────────────────────────────────────

describe("scoreImageCandidate — scoring", () => {
  test("hard-rejects rejected URL patterns (returns -9999)", () => {
    expect(scoreImageCandidate("https://example.com/logo.png", {})).toBe(-9999);
    expect(scoreImageCandidate("https://example.com/favicon.ico", {})).toBe(-9999);
    expect(scoreImageCandidate("https://example.com/avatar.jpg", {})).toBe(-9999);
  });

  test("hard-rejects images with logo/avatar class", () => {
    expect(scoreImageCandidate("https://example.com/img.jpg", { class: "site-logo" })).toBe(-9999);
    expect(scoreImageCandidate("https://example.com/img.jpg", { class: "author-avatar" })).toBe(-9999);
    expect(scoreImageCandidate("https://example.com/img.jpg", { class: "nav-icon" })).toBe(-9999);
  });

  test("hard-rejects images with tiny explicit dimensions", () => {
    expect(scoreImageCandidate("https://example.com/img.jpg", { width: "1", height: "1" })).toBe(-9999);
    expect(scoreImageCandidate("https://example.com/img.jpg", { width: "30", height: "30" })).toBe(-9999);
    expect(scoreImageCandidate("https://example.com/img.jpg", { width: "40" })).toBe(-9999);
  });

  test("large product image scores higher than small neutral image", () => {
    const large = scoreImageCandidate("https://cdn.shop.com/product.jpg", { width: "800", height: "600" });
    const small = scoreImageCandidate("https://example.com/image.jpg", {});
    expect(large).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(0);
  });

  test("product-image class boosts score significantly", () => {
    const withClass = scoreImageCandidate("https://example.com/img.jpg", { class: "product-image" });
    const withoutClass = scoreImageCandidate("https://example.com/img.jpg", {});
    expect(withClass).toBeGreaterThan(withoutClass);
    expect(withClass).toBeGreaterThan(0);
  });

  test("main-image and hero class boost score", () => {
    const main = scoreImageCandidate("https://example.com/img.jpg", { class: "main-image" });
    const hero = scoreImageCandidate("https://example.com/img.jpg", { class: "hero-image" });
    expect(main).toBeGreaterThan(0);
    expect(hero).toBeGreaterThan(0);
  });

  test("meaningful alt text boosts score", () => {
    const withAlt = scoreImageCandidate("https://example.com/img.jpg", { alt: "W-Winning Tennis Dress front view" });
    const noAlt = scoreImageCandidate("https://example.com/img.jpg", {});
    expect(withAlt).toBeGreaterThan(noAlt);
  });

  test("JPEG/WebP formats score higher than generic URL", () => {
    const jpeg = scoreImageCandidate("https://example.com/photo.jpg", {});
    const webp = scoreImageCandidate("https://example.com/photo.webp", {});
    const noExt = scoreImageCandidate("https://example.com/photo", {});
    expect(jpeg).toBeGreaterThan(noExt);
    expect(webp).toBeGreaterThan(noExt);
  });

  test("URL containing 'product' gets a boost", () => {
    const product = scoreImageCandidate("https://cdn.shop.com/product-photo.jpg", {});
    const generic = scoreImageCandidate("https://cdn.shop.com/file.jpg", {});
    expect(product).toBeGreaterThan(generic);
  });
});

// ─── pickImageFromHtml ────────────────────────────────────────────────────────

describe("pickImageFromHtml — product page", () => {
  test("selects product-image over logo when both present", () => {
    const html = `
      <img src="/logo.png" class="site-logo" width="120" height="40" alt="Logo" />
      <img src="/products/tennis-dress-hero.jpg" class="product-image" width="800" height="1000" alt="W-Winning Tennis Dress" />
    `;
    const result = pickImageFromHtml(html, new URL("https://wilson.com/products/tennis-dress"));
    expect(result).not.toBeNull();
    expect(result).toContain("tennis-dress-hero");
  });

  test("prefers data-zoom-image over src when both present", () => {
    const html = `
      <img src="/products/small-thumb.jpg" data-zoom-image="/products/large-zoom.jpg" class="main-image" width="400" height="400" />
    `;
    const result = pickImageFromHtml(html, new URL("https://example.com/product/123"));
    expect(result).not.toBeNull();
    expect(result).toContain("large-zoom");
  });

  test("picks data-large-image variant", () => {
    const html = `
      <img src="/thumb.jpg" data-large-image="/products/full-size.jpg" alt="Product" />
    `;
    const result = pickImageFromHtml(html, new URL("https://example.com/product/123"));
    expect(result).not.toBeNull();
    expect(result).toContain("full-size");
  });

  test("picks data-lazy-src variant", () => {
    const html = `
      <img src="/placeholder.gif" data-lazy-src="/recipe/chicken-pasta-photo.jpg" alt="Chicken Pasta" />
    `;
    const result = pickImageFromHtml(html, new URL("https://recipes.example.com/chicken-pasta"));
    expect(result).not.toBeNull();
    expect(result).toContain("chicken-pasta-photo");
  });

  test("picks itemprop=image with priority over plain img", () => {
    const html = `
      <img src="/logo.png" alt="Logo" />
      <img itemprop="image" src="/products/product-main.jpg" alt="Product" />
    `;
    const result = pickImageFromHtml(html, new URL("https://example.com/product/123"));
    expect(result).not.toBeNull();
    expect(result).toContain("product-main");
  });

  test("returns null when only bad images are present", () => {
    const html = `
      <img src="/favicon.ico" />
      <img src="/logo.png" class="site-logo" />
      <img src="/spacer.gif" width="1" height="1" />
      <img src="/nav-arrow.png" />
    `;
    const result = pickImageFromHtml(html, new URL("https://example.com"));
    expect(result).toBeNull();
  });

  test("resolves relative URLs to absolute", () => {
    const html = `
      <img src="/products/dress-photo.jpg" class="product-image" width="600" height="800" alt="Dress" />
    `;
    const result = pickImageFromHtml(html, new URL("https://fashion.example.com/products/dress"));
    expect(result).not.toBeNull();
    expect(result!.startsWith("https://fashion.example.com")).toBe(true);
  });

  test("extracts image URL embedded in raw JS/JSON within HTML", () => {
    const html = `
      <script>
        var data = {"productImage": "https://cdn.example.com/product-full.jpg"};
      </script>
      <img src="/logo.png" class="logo" />
    `;
    const result = pickImageFromHtml(html, new URL("https://example.com/product/123"));
    expect(result).not.toBeNull();
    expect(result).toContain("product-full");
  });
});

// ─── pickJsonLd ───────────────────────────────────────────────────────────────

describe("pickJsonLd — type-prioritized extraction", () => {
  test("picks Product type over WebSite/Organization", () => {
    const html = `
      <script type="application/ld+json">
      [
        {"@type": "WebSite", "name": "Wilson Sports", "image": "https://cdn.wilson.com/logo.png"},
        {"@type": "Product", "name": "Tennis Dress", "image": "https://cdn.wilson.com/products/tennis-dress.jpg"}
      ]
      </script>
    `;
    const result = pickJsonLd(html);
    expect(result.image).not.toBeNull();
    expect(result.image).toContain("tennis-dress");
    expect(result.image).not.toContain("logo");
  });

  test("picks Recipe type image", () => {
    const html = `
      <script type="application/ld+json">
      {"@type": "Recipe", "name": "Chicken Pasta", "image": "https://cdn.allrecipes.com/food/chicken-pasta.jpg"}
      </script>
    `;
    const result = pickJsonLd(html);
    expect(result.image).toContain("chicken-pasta");
    expect(result.title).toBe("Chicken Pasta");
  });

  test("prefers Product over Article when both present", () => {
    const html = `
      <script type="application/ld+json">
      [
        {"@type": "Article", "name": "Review Article", "image": "https://example.com/article-thumb.jpg"},
        {"@type": "Product", "name": "Tennis Dress", "image": "https://example.com/product-photo.jpg"}
      ]
      </script>
    `;
    const result = pickJsonLd(html);
    expect(result.image).toContain("product-photo");
  });

  test("rejects logo images even from JSON-LD schema", () => {
    const html = `
      <script type="application/ld+json">
      {"@type": "Product", "name": "Product", "image": "https://example.com/site-logo.png"}
      </script>
    `;
    const result = pickJsonLd(html);
    expect(result.image).toBeNull();
  });

  test("returns empty for HTML with no JSON-LD", () => {
    const result = pickJsonLd("<html><body>No schema here</body></html>");
    expect(result.image).toBeUndefined();
    expect(result.title).toBeUndefined();
  });

  test("handles @graph flattening", () => {
    const html = `
      <script type="application/ld+json">
      {
        "@graph": [
          {"@type": "WebSite", "name": "Shop", "image": "https://example.com/logo.png"},
          {"@type": "Product", "name": "Dress", "image": "https://example.com/dress.jpg"}
        ]
      }
      </script>
    `;
    const result = pickJsonLd(html);
    expect(result.image).toContain("dress");
  });

  test("handles image as array", () => {
    const html = `
      <script type="application/ld+json">
      {"@type": "Recipe", "name": "Pasta", "image": ["https://cdn.example.com/pasta-1.jpg", "https://cdn.example.com/pasta-2.jpg"]}
      </script>
    `;
    const result = pickJsonLd(html);
    expect(result.image).toBeTruthy();
  });

  test("handles image as object with url property", () => {
    const html = `
      <script type="application/ld+json">
      {"@type": "Product", "name": "Watch", "image": {"@type": "ImageObject", "url": "https://cdn.example.com/watch-main.jpg"}}
      </script>
    `;
    const result = pickJsonLd(html);
    expect(result.image).toContain("watch-main");
  });
});

// ─── inferType ────────────────────────────────────────────────────────────────

describe("inferType — URL and og:type classification", () => {
  test("youtube.com → video", () => {
    expect(inferType("https://www.youtube.com/watch?v=abc123", null)).toBe("video");
  });
  test("youtu.be → video", () => {
    expect(inferType("https://youtu.be/abc123", null)).toBe("video");
  });
  test("tiktok → video", () => {
    expect(inferType("https://www.tiktok.com/@creator/video/123", null)).toBe("video");
  });
  test("amazon product → product", () => {
    expect(inferType("https://www.amazon.com/dp/B08N5WRWNW", null)).toBe("product");
  });
  test("etsy → product", () => {
    expect(inferType("https://www.etsy.com/listing/123/handmade-bag", null)).toBe("product");
  });
  test("allrecipes → recipe", () => {
    expect(inferType("https://www.allrecipes.com/recipe/chicken-pasta/", null)).toBe("recipe");
  });
  test("seriouseats → recipe", () => {
    expect(inferType("https://www.seriouseats.com/recipe-name", null)).toBe("recipe");
  });
  test("instagram → social", () => {
    expect(inferType("https://www.instagram.com/p/abc123", null)).toBe("social");
  });
  test("pinterest → social", () => {
    expect(inferType("https://www.pinterest.com/pin/123", null)).toBe("social");
  });
  test("og:type product → product", () => {
    expect(inferType("https://example.com/page", "product")).toBe("product");
  });
  test("og:type video → video", () => {
    expect(inferType("https://example.com/page", "video")).toBe("video");
    expect(inferType("https://example.com/page", "video.other")).toBe("video");
  });
  test("og:type article → article", () => {
    expect(inferType("https://example.com/blog/post", "article")).toBe("article");
  });
  test("generic URL with no og:type → link", () => {
    expect(inferType("https://www.wilson.com/products/tennis-dress", null)).toBe("link");
    expect(inferType("https://example.com/some-page", null)).toBe("link");
  });
  test("fashion product URL — no special inference (requires AI)", () => {
    // Fashion is NOT auto-detected from URL alone — it requires AI categorization
    const t = inferType("https://www.fabletics.com/products/leggings", null);
    expect(["link", "product"]).toContain(t);
  });
});
