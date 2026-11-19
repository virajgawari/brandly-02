import type { Product } from "./product";

/** Active products of a brand, or [] when they can't be loaded. */
export async function fetchBrandProducts(brandId: string): Promise<Product[]> {
  const res = await fetch(`/api/products?brandId=${brandId}`).catch(() => null);
  if (!res?.ok) return [];
  const data = (await res.json().catch(() => null)) as { products?: Product[] } | null;
  return (data?.products ?? []).filter((p) => p.status === "active");
}

/** Takes one photo out of every product that lists it; a product left with no photos is archived. */
export async function dropPathFromProducts(brandId: string, path: string): Promise<void> {
  const products = await fetchBrandProducts(brandId);
  await Promise.all(
    products
      .filter((p) => p.imagePaths.includes(path))
      .map((p) => {
        const imagePaths = p.imagePaths.filter((x) => x !== path);
        if (!imagePaths.length) return fetch(`/api/products/${p.id}`, { method: "DELETE" }).catch(() => null);
        return fetch(`/api/products/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: p.name, description: p.description, price: p.price, url: p.url, imagePaths, source: p.source }),
        }).catch(() => null);
      })
  );
}
