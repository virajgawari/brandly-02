import { NextRequest, NextResponse } from "next/server";
import type { BrandModel } from "@/lib/brand/model";
import { requireAi } from "@/lib/db/budget";
import { trustedModel } from "@/lib/db/brands";
import { errorResponse } from "@/lib/db/session";
import { compositeProductScene } from "@/lib/images/product-composite";
import { museEnabled } from "@/lib/render/muse";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Place in scene": POST { brandModel, scene?, sceneText?, aspect? } -> { path, url, c2paSigned }.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireAi();
    const { id } = await ctx.params;
    const b = (await req.json().catch(() => ({}))) as { brandModel?: BrandModel; scene?: string; sceneText?: string; aspect?: "4:5" | "1:1" | "9:16" };
    if (!museEnabled()) return NextResponse.json({ error: "Scene placement isn't set up (MUSE_API_KEY is missing)." }, { status: 503 });
    const model = await trustedModel(s, b.brandModel);
    if (!model?.expression) return NextResponse.json({ error: "brandModel is required" }, { status: 400 });
    const r = await compositeProductScene(s, { productId: id, model, scene: b.scene, sceneText: b.sceneText, aspect: b.aspect });
    if (!r) return NextResponse.json({ error: "Couldn't place the product in a scene, try again." }, { status: 502 });
    return NextResponse.json(r);
  } catch (err) {
    return errorResponse(err, "product-scene");
  }
}
