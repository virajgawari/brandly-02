import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/db/session";

// Workspace settings (owner/admin only, enforced by RLS). Body: { name?, dataTrainingOptIn? }
export async function PATCH(req: NextRequest) {
  try {
    const b = (await req.json()) as { name?: string; dataTrainingOptIn?: boolean; aiWatermark?: boolean; emailPrefs?: { weekly?: boolean; product?: boolean }; fullName?: string };
    const row: Record<string, unknown> = {};
    if (typeof b.name === "string" && b.name.trim()) row.name = b.name.trim().slice(0, 80);
    if (typeof b.dataTrainingOptIn === "boolean") {
      row.data_training_opt_in = b.dataTrainingOptIn;
      row.consent_at = b.dataTrainingOptIn ? new Date().toISOString() : null;
    }
    if (typeof b.aiWatermark === "boolean") row.ai_watermark = b.aiWatermark;
    if (b.emailPrefs && typeof b.emailPrefs === "object") row.email_prefs = { weekly: !!b.emailPrefs.weekly, product: !!b.emailPrefs.product };
    const fullName = typeof b.fullName === "string" ? b.fullName.trim().slice(0, 80) : "";
    if (!Object.keys(row).length && !fullName) return NextResponse.json({ ok: true });
    const s = await requireSession();
    if (fullName) {
      const { error } = await s.db.from("profiles").update({ full_name: fullName }).eq("id", s.userId);
      if (error) throw error;
    }
    if (!Object.keys(row).length) return NextResponse.json({ ok: true });
    const { error } = await s.db.from("workspaces").update(row).eq("id", s.workspaceId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "workspace");
  }
}
