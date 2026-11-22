import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireEditor } from "@/lib/db/session";
import { ruleToRow } from "@/lib/db/mappers";
import { nextRunAfter } from "@/lib/automation-schedule";
import type { AutomationRule } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const rule = (await req.json()) as AutomationRule;
    if (!rule?.id || !rule.brandId) return NextResponse.json({ error: "rule with id and brandId is required" }, { status: 400 });
    const s = await requireEditor();
    const { data: ws } = await s.db.from("workspaces").select("timezone").eq("id", s.workspaceId).maybeSingle();
    const tz = (ws?.timezone as string | undefined) || "UTC";
    const { error } = await s.db
      .from("automation_rules")
      .insert({ ...ruleToRow({ ...rule, nextRun: nextRunAfter(rule.trigger, new Date(), tz).toISOString() }), id: rule.id, brand_id: rule.brandId, workspace_id: s.workspaceId, created_by: s.userId });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "rule create");
  }
}
