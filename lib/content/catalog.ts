import type { BrandModel } from "@/lib/brand/model";
import type { ProductRef } from "@/lib/types";

/** Closed list of real product names and signature items the model may name. Everything else must be written as a category. */
export function verifiedCatalog(model?: BrandModel, products?: ProductRef[]): string[] {
  const raw = [
    ...(products ?? []).map((p) => p.name),
    ...(model?.expression.photos ?? []).filter((p) => p.role === "product" && p.product?.name).map((p) => p.product!.name),
    ...(model?.content.productsServices ?? []),
    ...(model?.expression.distinctiveAssets ?? []),
  ];
  const seen = new Set<string>();
  return raw
    .map((x) => x.trim())
    .filter((x) => x && x.length <= 80 && !seen.has(x.toLowerCase()) && !!seen.add(x.toLowerCase()))
    .slice(0, 40);
}
