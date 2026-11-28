import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/db/session";
import { cleanProduct, ProductInputSchema, toProduct, type ProductRow } from "@/lib/catalog/product";
import { signPaths } from "@/lib/render/media";

type Row = ProductRow;

/** GET ?brandId=… → { products, urls } where urls maps image path → signed URL. */
export async function GET(req: NextRequest) {
  try {
    const s = await requireSession();
    const brandId = req.nextUrl.searchParams.get("brandId");
    if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    const { data, error } = await s.db
      .from("products")
      .select("*")
      .eq("brand_id", brandId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const products = (data as Row[]).map(toProduct);
    const paths = [...new Set(products.flatMap((p) => p.imagePaths))];
    const signed = await signPaths(s, "images", paths, 60 * 60);
    return NextResponse.json({ products, urls: Object.fromEntries(paths.map((p, i) => [p, signed[i]])) });
  } catch (err) {
    return errorResponse(err, "products list");
  }
}

/** POST { brandId, ...product } → { product } */
export async function POST(req: NextRequest) {
  try {
    const s = await requireSession();
    const body = (await req.json().catch(() => null)) as { brandId?: string } | null;
    const parsed = ProductInputSchema.safeParse(body);
    if (!body?.brandId || !parsed.success) return NextResponse.json({ error: "Add a brand and a product name." }, { status: 400 });
    const clean = cleanProduct(parsed.data, (p) => p.startsWith(`${s.workspaceId}/`));
    if (!clean) return NextResponse.json({ error: "Give the product a name." }, { status: 400 });
    const { data, error } = await s.db
      .from("products")
      .insert({ ...clean, workspace_id: s.workspaceId, brand_id: body.brandId, created_by: s.userId })
      .select("*")
      .single();
    if (error) throw error;
    if (clean.image_paths?.length && data.cutout_status !== "ready") {
      const { enqueueAndKick } = await import("@/lib/jobs/queue");
      await enqueueAndKick({ kind: "product.cutout", workspaceId: s.workspaceId, brandId: data.brand_id, payload: { productId: data.id }, dedupeKey: `cutout:${data.id}`, createdBy: s.userId, maxAttempts: 2 }).catch((e) => console.error("[products] cutout enqueue failed", e));
    }
    return NextResponse.json({ product: toProduct(data as Row) });
  } catch (err) {
    return errorResponse(err, "product create");
  }
}
