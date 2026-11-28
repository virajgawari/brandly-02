import { NextRequest, NextResponse } from "next/server";
import { runLearner } from "@/lib/agent/learn";
import { checkCron } from "@/lib/jobs/cron-auth";
import { errorResponse, type Session } from "@/lib/db/session";
import { withLlmContext } from "@/lib/llm-log";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Weekly: runs the learner for every brand in workspaces where learning is on. Uses the service role,
// so each run is scoped to one workspace by hand. Respects each workspace's own switches (enabled, use_llm).
export async function GET(req: NextRequest) {
  const denied = checkCron(req);
  if (denied) return denied;
  try {
    const db = adminClient();
    if (!db) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not configured." }, { status: 503 });
    const [brands, off] = await Promise.all([
      db.from("brands").select("id, workspace_id").order("created_at", { ascending: true }).limit(500),
      db.from("agent_config").select("workspace_id").eq("enabled", false),
    ]);
    if (brands.error) throw brands.error;
    const disabled = new Set((off.data ?? []).map((r) => r.workspace_id as string));
    const started = Date.now();
    let ran = 0;
    const failed: string[] = [];
    for (const b of brands.data ?? []) {
      if (disabled.has(b.workspace_id) || Date.now() - started > 45_000) continue;
      const s = { db, userId: "", workspaceId: b.workspace_id } as unknown as Session; // no user: created_by stays null
      try {
        await withLlmContext({ feature: "agent-learn", workspaceId: b.workspace_id, brandId: b.id, promptVersion: "agent-learn@1" }, () => runLearner(s, b.id, "cron"));
        ran++;
      } catch (err) {
        failed.push(`${b.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return NextResponse.json({ ran, failed });
  } catch (err) {
    return errorResponse(err, "cron learn");
  }
}
