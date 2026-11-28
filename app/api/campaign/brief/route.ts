import { NextRequest, NextResponse } from "next/server";
import { generateStructured } from "@/lib/llm";
import { buildCampaignPrompt, CAMPAIGN_PROMPT_VERSION, CAMPAIGN_SYSTEM, CampaignBriefSchema, cleanCampaignBrief } from "@/lib/content/campaign";
import { llmScope } from "@/lib/db/llm-scope";
import { errorResponse } from "@/lib/db/session";
import { requireAi } from "@/lib/db/budget";
import { trustedModel } from "@/lib/db/brands";
import type { BrandModel } from "@/lib/brand/model";

export const maxDuration = 30;

/** POST { brandModel, request } → { brief } — one cheap-tier call; the user edits and confirms before posts are written. */
export async function POST(req: NextRequest) {
  try {
    const s = await requireAi();
    const body = (await req.json().catch(() => null)) as { brandModel?: BrandModel; request?: string } | null;
    const model = await trustedModel(s, body?.brandModel);
    const request = body?.request?.trim();
    if (!model?.strategy || !model.name) return NextResponse.json({ error: "brandModel is required" }, { status: 400 });
    if (!request || request.length < 5) return NextResponse.json({ error: "Describe the campaign in a sentence." }, { status: 400 });

    const out = await llmScope("campaign-brief", { brandId: model.id, promptVersion: CAMPAIGN_PROMPT_VERSION }, () =>
      generateStructured(CampaignBriefSchema, CAMPAIGN_SYSTEM, buildCampaignPrompt(model, request), { task: "fast", maxTokens: 900, temperature: 0.8 })
    );
    const brief = cleanCampaignBrief(out);
    return NextResponse.json({ brief, llmCalls: 1 });
  } catch (err) {
    return errorResponse(err, "campaign-brief");
  }
}
