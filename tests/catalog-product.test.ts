import { describe, expect, it } from "vitest";
import { cleanProduct, cleanUrl, parseProductPage } from "@/lib/catalog/product";

describe("cleanProduct", () => {
  it("rejects a blank name", () => {
    expect(cleanProduct({ name: "   " })).toBeNull();
  });

  it("trims, dedupes tags, caps images and drops foreign paths", () => {
    const p = cleanProduct(
      { name: "  Cold  Brew ", tags: ["Coffee", "coffee", " Iced "], imagePaths: ["ws1/a.jpg", "ws2/b.jpg", "ws1/../x.jpg"], url: "javascript:alert(1)" },
      (path) => path.startsWith("ws1/")
    );
    expect(p).toMatchObject({ name: "Cold Brew", tags: ["coffee", "iced"], image_paths: ["ws1/a.jpg"], url: null, source: "manual", status: "active" });
  });
});

describe("cleanUrl", () => {
  it("keeps only http(s)", () => {
    expect(cleanUrl("https://a.com/x")).toBe("https://a.com/x");
    expect(cleanUrl("ftp://a.com")).toBeNull();
    expect(cleanUrl("nope")).toBeNull();
  });
});

describe("parseProductPage", () => {
  it("reads JSON-LD Product with relative image and offer price", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@graph": [{ "@type": "Product", name: "Filter Coffee", description: "Medium roast.", image: ["/img/a.jpg"], offers: { price: "450", priceCurrency: "INR" } }],
    })}</script></head></html>`;
    const r = parseProductPage(html, "https://shop.example.com/p/1");
    expect(r).toEqual({ name: "Filter Coffee", description: "Medium roast.", price: "INR 450", imageUrls: ["https://shop.example.com/img/a.jpg"] });
  });

  it("falls back to Open Graph tags", () => {
    const html = `<head><meta property="og:title" content="Mug &amp; Saucer"><meta property="og:description" content="Ceramic."><meta property="og:image" content="https://cdn.x.com/m.png"></head>`;
    const r = parseProductPage(html, "https://x.com/m");
    expect(r).toMatchObject({ name: "Mug & Saucer", description: "Ceramic.", price: null, imageUrls: ["https://cdn.x.com/m.png"] });
  });
});
