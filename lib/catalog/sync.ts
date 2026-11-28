import type { BrandPhoto } from "@/lib/brand/model";
import type { Product } from "./product";

/** Same cap as lib/brand/photos.ts MAX_BRAND_PHOTOS (that file is server-only). */
const MAX_PHOTOS = 24;

const active = (products: Product[]) => products.filter((p) => p.status === "active");
const noteOf = (p: Product) => p.description.replace(/\s+/g, " ").trim().slice(0, 80);

/**
 * Puts the photos of the given products on the brand's photo list as product photos,
 * so posts can use them. Existing entries keep their tags, colours and source; only role and name are set.
 */
export function photosFromProducts(products: Product[], existing: BrandPhoto[]): BrandPhoto[] {
  const out = [...existing];
  for (const p of active(products)) {
    const note = noteOf(p);
    for (const path of p.imagePaths) {
      const product = { name: p.name, ...(note ? { note } : {}) };
      const i = out.findIndex((x) => x.path === path);
      if (i >= 0) out[i] = { ...out[i], role: "product", product };
      else if (out.length < MAX_PHOTOS) out.push({ path, source: p.source === "url" ? "website" : "upload", addedAt: p.createdAt, role: "product", product });
    }
  }
  return out;
}

/** Drops only the given paths (photos that live only in Assets stay). */
export function removeProductPaths(photos: BrandPhoto[], paths: string[]): BrandPhoto[] {
  const gone = new Set(paths);
  return photos.filter((p) => !gone.has(p.path));
}

/** Product photos on the brand that no active product lists, grouped by product name. */
export function unlistedProductPhotos(photos: BrandPhoto[], products: Product[]): { name: string; imagePaths: string[] }[] {
  const listed = new Set(active(products).flatMap((p) => p.imagePaths));
  const groups = new Map<string, string[]>();
  for (const ph of photos) {
    if (ph.role !== "product" || listed.has(ph.path)) continue;
    const name = ph.product?.name?.trim() || "Untitled product";
    groups.set(name, [...(groups.get(name) ?? []), ph.path]);
  }
  return [...groups].map(([name, imagePaths]) => ({ name, imagePaths: imagePaths.slice(0, 6) }));
}

/** Paths from `paths` that belong to some active product. */
export function pathsInProducts(paths: string[], products: Product[]): string[] {
  const listed = new Set(active(products).flatMap((p) => p.imagePaths));
  return paths.filter((p) => listed.has(p));
}
