import { describe, expect, it } from "vitest";
import { photosFromProducts, removeProductPaths, unlistedProductPhotos, pathsInProducts } from "@/lib/catalog/sync";
import type { Product } from "@/lib/catalog/product";
import type { BrandPhoto } from "@/lib/brand/model";

const prod = (over: Partial<Product>): Product => ({
  id: "p1", brandId: "b", name: "Cold brew", description: "", price: null, url: null, category: null, tags: [],
  imagePaths: ["a.jpg"], source: "manual", status: "active", createdAt: "2026-01-01T00:00:00Z", ...over,
});
const photo = (over: Partial<BrandPhoto>): BrandPhoto => ({ path: "x.jpg", source: "upload", addedAt: "2026-01-01T00:00:00Z", ...over });

describe("photosFromProducts", () => {
  it("adds product photos with the product name", () => {
    const out = photosFromProducts([prod({})], []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ path: "a.jpg", role: "product", product: { name: "Cold brew" } });
  });
  it("keeps tags and colours of an existing photo but sets role and name", () => {
    const out = photosFromProducts([prod({})], [photo({ path: "a.jpg", colors: ["#fff"], source: "website" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ role: "product", colors: ["#fff"], source: "website", product: { name: "Cold brew" } });
  });
  it("ignores archived products", () => {
    expect(photosFromProducts([prod({ status: "archived" })], [])).toHaveLength(0);
  });
});

describe("removeProductPaths", () => {
  it("removes only the listed paths", () => {
    const out = removeProductPaths([photo({ path: "a.jpg" }), photo({ path: "b.jpg" })], ["a.jpg"]);
    expect(out.map((p) => p.path)).toEqual(["b.jpg"]);
  });
});

describe("unlistedProductPhotos", () => {
  it("groups product photos no active product lists, by name", () => {
    const photos = [
      photo({ path: "a.jpg", role: "product", product: { name: "Cold brew" } }),
      photo({ path: "b.jpg", role: "product", product: { name: "Beans" } }),
      photo({ path: "c.jpg", role: "product", product: { name: "Beans" } }),
      photo({ path: "d.jpg" }),
    ];
    const out = unlistedProductPhotos(photos, [prod({ imagePaths: ["a.jpg"] })]);
    expect(out).toEqual([{ name: "Beans", imagePaths: ["b.jpg", "c.jpg"] }]);
  });
  it("names unnamed ones", () => {
    expect(unlistedProductPhotos([photo({ path: "z.jpg", role: "product" })], [])[0].name).toBe("Untitled product");
  });
});

describe("pathsInProducts", () => {
  it("returns the paths an active product holds", () => {
    expect(pathsInProducts(["a.jpg", "q.jpg"], [prod({})])).toEqual(["a.jpg"]);
  });
});
