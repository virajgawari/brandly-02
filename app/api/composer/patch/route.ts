import { NextRequest, NextResponse } from "next/server";
import type { BrandModel } from "@/lib/brand/model";
import { cleanInstruction, diffDrafts, mergePatch, newFailures, PatchSchema, patchPrompt, type PatchDraft } from "@/lib/content/patch";
import { brandContextOf } from "@/lib/content/prompt";
import { requireAi } from "@/lib/db/budget";
import { trustedModel } from "@/lib/db/brands";
import { llmScope } from "@/lib/db/llm-scope";
import { errorResponse } from "@/lib/db/session";
import { generateStructured } from "@/lib/llm";
import type { Platform } from "@/lib/types";

export const maxDuration = 30;
const PLATFORMS = ["instagram", "facebook", "linkedin", "twitter"];

interface Body {
  postId?: string;
  instruction?: string;
  currentDraft?: Partial<PatchDraft>;
  platform?: Platform;
  brandModel?: BrandModel;
}

// POST { postId, instruction, currentDraft, platform, brandModel } -> { patch, merged, changeSummary } or 422 { failures }.
// Editor role plus the workspace's hourly AI cap (requireAi). The merged draft must pass the deterministic checks.
export async function POST(req: NextRequest) {
  try {
    const s = await requireAi();
    const b = (await req.json().catch(() => ({}))) as Body;
    const instruction = cleanInstruction(b.instruction);
    const platform: Platform = b.platform && PLATFORMS.includes(b.platform) ? b.platform : "instagram";
    const d = b.currentDraft;
    if (!instruction || !d || typeof d.caption !== "string") return NextResponse.json({ error: "instruction and currentDraft are required" }, { status: 400 });
    const model = await trustedModel(s, b.brandModel);
    const draft: PatchDraft = {
      headline: String(d.headline ?? ""),
      supportingLine: String(d.supportingLine ?? ""),
      caption: d.caption,
      hashtags: Array.isArray(d.hashtags) ? d.hashtags.map(String) : [],
      cta: String(d.cta ?? ""),
      layoutId: d.layoutId,
    };
    const brandContext = brandContextOf(model);
    const { system, user } = patchPrompt({ model, platform, draft, instruction, brandContext });
    const patch = await llmScope("composer-patch", { brandId: model?.id }, () => generateStructured(PatchSchema, system, user, { task: "fast", temperature: 0.5, maxTokens: 900 }));
    const merged = mergePatch(draft, patch);
    const diff = diffDrafts(draft, merged);
    if (!Object.keys(diff).length) return NextResponse.json({ error: "That instruction didn't change anything. Try wording it differently." }, { status: 422 });

    // Facts allowed = the brand context and the existing draft; never the instruction itself.
    const facts = [brandContext, draft.headline, draft.supportingLine, draft.caption, draft.cta].join("\n");
    const failures = newFailures(draft, merged, { model, platform, facts });
    if (failures.length) return NextResponse.json({ error: "That edit would break a brand rule, so it wasn't applied.", failures }, { status: 422 });

    if (b.postId) {
      const { error } = await s.db.from("content_events").insert({ workspace_id: s.workspaceId, post_id: b.postId, user_id: s.userId, event: "patched", props: { instruction, diff, platform } });
      if (error) console.warn("[patch] edit history not saved:", error.message);
    }
    return NextResponse.json({ patch: diff, merged, changeSummary: patch.changeSummary });
  } catch (err) {
    return errorResponse(err, "composer-patch");
  }
}
