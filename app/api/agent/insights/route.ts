import { NextResponse } from "next/server";
import { z } from "zod";
import { runLearner } from "@/lib/agent/learn";
import { llmScope } from "@/lib/db/llm-scope";
import { errorResponse, requireSession } from "@/lib/db/session";

const Query = z.object({ brandId: z.string().uuid() });
const Patch = z.object({ id: z.string().uuid(), status: z.enum(["proposed", "accepted", "dismissed"]) });

/** GET ?brandId= → { insights, lastRun } for the brand. */
export async function GET(req: Request) {
  try {
    const s = await requireSession();
    const q = Query.safeParse({ brandId: new URL(req.url).searchParams.get("brandId") });
    if (!q.success) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    const [ins, run] = await Promise.all([
      s.db.from("agent_insights").select("id, dimension, value, metric, direction, statement, stats, confidence, status, evidence_post_ids, updated_at").eq("brand_id", q.data.brandId).order("confidence", { ascending: false }).limit(50),
      s.db.from("agent_runs").select("id, created_at, posts_seen, with_metrics, findings, error").eq("brand_id", q.data.brandId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (ins.error) throw ins.error;
    return NextResponse.json({ insights: ins.data ?? [], lastRun: run.data ?? null });
  } catch (err) {
    return errorResponse(err, "agent insights");
  }
}

/** PATCH { id, status } → accept, dismiss or reset one insight. */
export async function PATCH(req: Request) {
  try {
    const s = await requireSession();
    const body = Patch.safeParse(await req.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "id and a valid status are required" }, { status: 400 });
    const { error } = await s.db
      .from("agent_insights")
      .update({ status: body.data.status, decided_by: s.userId, decided_at: new Date().toISOString() })
      .eq("id", body.data.id)
      .eq("workspace_id", s.workspaceId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "agent insight update");
  }
}

/** POST { brandId } → run the learner now. */
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const q = Query.safeParse(await req.json().catch(() => null));
    if (!q.success) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    return NextResponse.json(await llmScope("agent-learn", { brandId: q.data.brandId, promptVersion: "agent-learn@1" }, () => runLearner(s, q.data.brandId)));
  } catch (err) {
    return errorResponse(err, "agent learn");
  }
}
