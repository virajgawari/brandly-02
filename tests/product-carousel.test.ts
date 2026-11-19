import { describe, expect, it, vi } from "vitest";
import { chooseLayout, chunkProducts, MAX_CAROUSEL_PRODUCTS, pickBrief, PRODUCT_CAROUSEL, layoutNeedsPhoto } from "@/lib/content/brief";
import { EMPTY_HISTORY } from "@/lib/content/history";
import { productSlides } from "@/lib/content/prompt";
import { SELECTABLE_LAYOUTS } from "@/lib/render/kit";
import type { ProductRef } from "@/lib/types";

// prompt.ts reaches history.ts, which is marked server-only.
vi.mock("server-only", () => ({}));
const products =(n: number): ProductRef[] => Array.from({ length: n }, (_, i) => ({ path: `p/${i}.jpg`, name: `Item ${i + 1}`, note: i === 0 ? "Best seller" : undefined }));

describe("chunkProducts", () => {
  it("splits into carousels of at most 8", () => {
    expect(chunkProducts(products(8)).map((c) => c.length)).toEqual([8]);
    expect(chunkProducts(products(9)).map((c) => c.length)).toEqual([8, 1]);
    expect(chunkProducts(products(20)).map((c) => c.length)).toEqual([8, 8, 4]);
    expect(chunkProducts([])).toEqual([]);
    expect(MAX_CAROUSEL_PRODUCTS).toBe(8);
  });
});

describe("productSlides", () => {
  it("is cover + one slide per product + CTA, with names and photos from the request", () => {
    const list = products(3);
    const out = productSlides(list, [], "Fresh in", "Shop now");
    expect(out).toHaveLength(5);
    expect(out[0].headline).toBe("Fresh in");
    expect(out.slice(1, 4).map((s) => s.headline)).toEqual(["Item 1", "Item 2", "Item 3"]);
    expect(out.slice(1, 4).map((s) => s.photoPath)).toEqual(["p/0.jpg", "p/1.jpg", "p/2.jpg"]);
    expect(out[1].body).toBe("Best seller");
    expect(out[4].headline).toBe("Shop now");
  });

  it("uses the model's text only when it lines up, and never its product order", () => {
    const list = products(2);
    const written = [{ headline: "Cover" }, { headline: "Wrong name", body: "Smooth finish" }, { headline: "Other", body: "Lasts all day" }, { headline: "Order today" }];
    const out = productSlides(list, written, "x", "y");
    expect(out.map((s) => s.headline)).toEqual(["Cover", "Item 1", "Item 2", "Order today"]);
    expect(out[1].body).toBe("Smooth finish");
    // a mismatched count falls back to the product notes
    const short = productSlides(list, [{ headline: "Cover" }], "x", "y");
    expect(short[1].body).toBe("Best seller");
    expect(short[2].body).toBe("");
  });
});

describe("product carousel brief and layout", () => {
  it("forces the product carousel format and caps products at 8", () => {
    const b = pickBrief(undefined, EMPTY_HISTORY, undefined, { products: products(12) });
    expect(b.format).toBe(PRODUCT_CAROUSEL);
    expect(b.carousel).toBe(true);
    expect(b.products).toHaveLength(8);
  });

  it("never picks the product format on its own", () => {
    for (let i = 0; i < 30; i++) expect(pickBrief(undefined, EMPTY_HISTORY, undefined).format).not.toBe(PRODUCT_CAROUSEL);
  });

  it("chooses the product cover and keeps product layouts out of the kit editor", () => {
    expect(chooseLayout({ layouts: ["photo-band"] } as never, undefined, EMPTY_HISTORY, { product: true })).toBe("product-cover");
    expect(layoutNeedsPhoto("product-cover")).toBe(true);
    expect(SELECTABLE_LAYOUTS).not.toContain("product-cover");
    expect(SELECTABLE_LAYOUTS).not.toContain("product-slide");
  });
});
