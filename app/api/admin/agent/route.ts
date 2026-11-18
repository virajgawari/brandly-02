import { NextResponse } from "next/server";
import { z } from "zod";
import { adminError, audit, requireAdmin } from "@/lib/agent/admin";
import { ConfigPatchSchema } from "@/lib/agent/config";
import { loadConfig, runLearner } from "@/lib/agent/learn";
import { llmScope } from "@/lib/db/llm-scope";

/** GET → everything the admin console shows for the current workspace. */
export async function GET() {
  try {
    const s = await requireAdmin();
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [config, insights, runs, log, cost] = await Promise.all([
      loadConfig(s),
      s.db.from("agent_insights").select("id, brand_id, dimension, value, metric, direction, statement, stats, confidence, status, evidence_post_ids, decided_at, updated_at, brands(name)").eq("workspace_id", s.workspaceId).order("updated_at", { ascending: false }).limit(200),
      s.db.from("agent_runs").select("id, brand_id, trigger, posts_seen, with_metrics, findings, error, created_at, llm_calls(cost_usd, model, input_tokens, output_tokens), brands(name)").eq("workspace_id", s.workspaceId).order("created_at", { ascending: false }).limit(30),
      s.db.from("admin_audit").select("id, user_id, action, target, detail, created_at").eq("workspace_id", s.workspaceId).order("created_at", { ascending: false }).limit(30),
      s.db.from("llm_calls").select("cost_usd, input_tokens, output_tokens").eq("workspace_id", s.workspaceId).eq("feature", "agent-learn").gte("created_at", since),
    ]);
    for (const r of [insights, runs, log, cost]) if (r.error) throw r.error;
    const calls = cost.data ?? [];
    return NextResponse.json({
      config,
      insights: insights.data ?? [],
      runs: runs.data ?? [],
      audit: log.data ?? [],
      cost30d: { calls: calls.length, usd: calls.reduce((a, c) => a + Number(c.cost_usd ?? 0), 0), tokens: calls.reduce((a, c) => a + (c.input_tokens ?? 0) + (c.output_tokens ?? 0), 0) },
    });
  } catch (err) {
    return adminError(err, "admin agent");
  }
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("config"), patch: ConfigPatchSchema }),
  z.object({ action: z.literal("insight"), id: z.string().uuid(), status: z.enum(["proposed", "accepted", "dismissed"]) }),
  z.object({ action: z.literal("delete-insight"), id: z.string().uuid() }),
  z.object({ action: z.literal("relearn"), brandId: z.string().uuid() }),
]);

/** POST { action, ... } → change settings, decide or delete an insight, or force a relearn. Every change is audited. */
export async function POST(req: Request) {
  try {
    const s = await requireAdmin();
    const body = Action.safeParse(await req.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    const a = body.data;

    if (a.action === "config") {
      const { error } = await s.db.from("agent_config").upsert({ workspace_id: s.workspaceId, ...a.patch, updated_by: s.userId, updated_at: new Date().toISOString() });
      if (error) throw error;
      await audit(s, "config.update", undefined, a.patch);
      return NextResponse.json({ config: await loadConfig(s) });
    }
    if (a.action === "insight") {
      const { error } = await s.db.from("agent_insights").update({ status: a.status, decided_by: s.userId, decided_at: new Date().toISOString() }).eq("id", a.id).eq("workspace_id", s.workspaceId);
      if (error) throw error;
      await audit(s, `insight.${a.status === "accepted" ? "accept" : a.status === "dismissed" ? "dismiss" : "reset"}`, a.id);
      return NextResponse.json({ ok: true });
    }
    if (a.action === "delete-insight") {
      const { error } = await s.db.from("agent_insights").delete().eq("id", a.id).eq("workspace_id", s.workspaceId);
      if (error) throw error;
      await audit(s, "insight.delete", a.id);
      return NextResponse.json({ ok: true });
    }
    const result = await llmScope("agent-learn", { brandId: a.brandId, promptVersion: "agent-learn@1" }, () => runLearner(s, a.brandId));
    await audit(s, "learn.run", a.brandId, { findings: result.findings, postsSeen: result.postsSeen });
    return NextResponse.json(result);
  } catch (err) {
    return adminError(err, "admin agent update");
  }
}
