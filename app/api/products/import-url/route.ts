import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/db/session";
import { cleanProduct, cleanUrl, parseProductPage, toProduct, type ProductRow } from "@/lib/catalog/product";
import { safeFetch } from "@/lib/net/safe-fetch";
import { downloadAsJpeg } from "@/lib/render/assets";
import { saveBrandPhoto } from "@/lib/brand/photos";

export const maxDuration = 60;

/** POST { brandId, url } → { product }. Reads the page's schema.org/Open Graph data; no AI call. */
export async function POST(req: NextRequest) {
  try {
    const s = await requireSession();
    const body = (await req.json().catch(() => null)) as { brandId?: string; url?: string } | null;
    const url = cleanUrl(body?.url);
    if (!body?.brandId || !url) return NextResponse.json({ error: "Paste a product link starting with https://" }, { status: 400 });

    const res = await safeFetch(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: "text/html" } });
    if (!res.ok) return NextResponse.json({ error: `That page didn't load (${res.status}).` }, { status: 422 });
    const html = (await res.text()).slice(0, 1_500_000);
    const page = parseProductPage(html, url);
    if (!page.name) return NextResponse.json({ error: "Couldn't find a product on that page. Add it by hand instead." }, { status: 422 });

    const imagePaths: string[] = [];
    for (const img of page.imageUrls.slice(0, 4)) {
      const jpeg = await downloadAsJpeg(img);
      if (!jpeg) continue;
      try {
        imagePaths.push((await saveBrandPhoto(s, body.brandId, jpeg.buf, "website", img, "product")).path);
      } catch (err) {
        console.warn("[product import]", err instanceof Error ? err.message : err);
      }
    }

    const clean = cleanProduct({ name: page.name, description: page.description, price: page.price, url, imagePaths, source: "url" }, (p) => p.startsWith(`${s.workspaceId}/`));
    if (!clean) return NextResponse.json({ error: "Couldn't read a product name from that page." }, { status: 422 });
    const { data, error } = await s.db
      .from("products")
      .insert({ ...clean, workspace_id: s.workspaceId, brand_id: body.brandId, created_by: s.userId })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ product: toProduct(data as ProductRow) });
  } catch (err) {
    return errorResponse(err, "product import");
  }
}
