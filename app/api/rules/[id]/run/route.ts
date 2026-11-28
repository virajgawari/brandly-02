import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/db/session";
import { requireAi } from "@/lib/db/budget";
import { runRule } from "@/lib/automation-run";

export const maxDuration = 60;

// "Run now": the same runner the cron uses. Writes a draft post.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const s = await requireAi();
    const r = await runRule(s.db as never, id, s.workspaceId, s.userId);
    return NextResponse.json(r, { status: r.status === "error" ? 502 : 200 });
  } catch (err) {
    return errorResponse(err, "rule run");
  }
}
