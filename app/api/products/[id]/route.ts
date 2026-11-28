import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/db/session";
import { cleanProduct, ProductInputSchema, toProduct } from "@/lib/catalog/product";

/** PATCH { ...product } → { product } (full replace of the editable fields). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const s = await requireSession();
    const parsed = ProductInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid product." }, { status: 400 });
    const clean = cleanProduct(parsed.data, (p) => p.startsWith(`${s.workspaceId}/`));
    if (!clean) return NextResponse.json({ error: "Give the product a name." }, { status: 400 });
    const { data, error } = await s.db.from("products").update(clean).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    if (clean.image_paths?.length && data.cutout_status !== "ready") {
      const { enqueueAndKick } = await import("@/lib/jobs/queue");
      await enqueueAndKick({ kind: "product.cutout", workspaceId: s.workspaceId, brandId: data.brand_id, payload: { productId: data.id }, dedupeKey: `cutout:${data.id}`, createdBy: s.userId, maxAttempts: 2 }).catch((e) => console.error("[products] cutout enqueue failed", e));
    }
    return NextResponse.json({ product: toProduct(data) });
  } catch (err) {
    return errorResponse(err, "product update");
  }
}

/** DELETE → archives instead of deleting, so past posts keep their product. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const s = await requireSession();
    const { error } = await s.db.from("products").update({ status: "archived" }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "product archive");
  }
}
