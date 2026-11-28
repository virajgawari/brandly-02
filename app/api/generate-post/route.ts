import { NextRequest, NextResponse } from "next/server";
import type { GeneratePostPayload, ProductRef } from "@/lib/types";
import { MAX_CAROUSEL_PRODUCTS } from "@/lib/content/brief";
import { generatePost } from "@/lib/content/generate";
import { errorResponse } from "@/lib/db/session";
import { requireAi } from "@/lib/db/budget";
import { trustedModel } from "@/lib/db/brands";
import { enqueueAndKick } from "@/lib/jobs/queue";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/** Keeps only products that are the brand's own product photos, in the order sent. */
function validProducts(body: GeneratePostPayload): ProductRef[] | undefined {
  if (!body.products?.length) return undefined;
  const own = new Map((body.brandModel?.expression.photos ?? []).filter((p) => p.role === "product").map((p) => [p.path, p]));
  const out: ProductRef[] = [];
  for (const p of body.products) {
    const photo = own.get(p.path);
    if (!photo || out.some((o) => o.path === p.path)) continue;
    const name = (p.name || photo.product?.name || "").trim().slice(0, 60);
    if (!name) continue;
    const note = (p.note || photo.product?.note || "").trim().slice(0, 80);
    out.push({ path: p.path, name, ...(note ? { note } : {}) });
  }
  return out.length ? out.slice(0, MAX_CAROUSEL_PRODUCTS) : undefined;
}

// Picks a brief (format, hook, pillar) from the brand's recent posts, writes the post
// with the full brand context, and chooses a layout. Runs through n8n when it is configured.
export async function POST(req: NextRequest) {
  try {
    const s = await requireAi();
    const body: GeneratePostPayload = await req.json().catch(() => null) as GeneratePostPayload;
    if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    body.brandModel = await trustedModel(s, body.brandModel);
    if (!body.platforms?.length) return NextResponse.json({ error: "Choose at least one platform" }, { status: 400 });
    const input = {
      products: validProducts(body),
      feature: "generate-post" as const,
      model: body.brandModel,
      dna: body.brandDNA,
      platforms: body.platforms,
      template: body.template,
      topic: body.topic,
      tone: body.tone,
      additionalContext: body.additionalContext,
      single: !!body.single,
      n8nBody: body as unknown as Record<string, unknown>,
    };
    // Default: queue the work and return a job id (the client polls /api/jobs/[id]).
    // Falls back to writing the post inline when the queue is unavailable or ?sync=1 is set.
    if (req.nextUrl.searchParams.get("sync") !== "1" && adminClient()) {
      const jobId = await enqueueAndKick({
        kind: "generate.post",
        workspaceId: s.workspaceId,
        createdBy: s.userId,
        maxAttempts: 1,
        payload: { input },
      });
      return NextResponse.json({ jobId }, { status: 202 });
    }
    const result = await generatePost(input);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "generate-post");
  }
}
