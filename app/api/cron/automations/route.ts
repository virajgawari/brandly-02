import { NextRequest, NextResponse } from "next/server";
import { checkCron } from "@/lib/jobs/cron-auth";
import { errorResponse } from "@/lib/db/session";
import { runDueRules } from "@/lib/automation-run";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Turns every due automation rule into a draft post. Run it every 15 minutes.
export async function GET(req: NextRequest) {
  const denied = checkCron(req);
  if (denied) return denied;
  try {
    const db = adminClient();
    if (!db) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
    return NextResponse.json(await runDueRules(db, Date.now() + 40_000));
  } catch (err) {
    return errorResponse(err, "cron automations");
  }
}
