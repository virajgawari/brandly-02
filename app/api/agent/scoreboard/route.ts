import { NextResponse } from "next/server";
import { z } from "zod";
import { loadConfig, loadLearnPosts, settingsOf } from "@/lib/agent/learn";
import { scoreboard } from "@/lib/agent/stats";
import { errorResponse, requireSession } from "@/lib/db/session";

const Query = z.object({ brandId: z.string().uuid() });

/** GET ?brandId= → how well the judge's brand-fit score predicts real engagement. No LLM calls. */
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const q = Query.safeParse({ brandId: new URL(req.url).searchParams.get("brandId") });
    if (!q.success) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    const cfg = settingsOf(await loadConfig(s));
    const { posts } = await loadLearnPosts(s, q.data.brandId, cfg.windowDays);
    return NextResponse.json(scoreboard(posts));
  } catch (err) {
    return errorResponse(err, "agent scoreboard");
  }
}
