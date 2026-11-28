import { NextRequest, NextResponse } from "next/server";
import { checkCron } from "@/lib/jobs/cron-auth";
import { errorResponse } from "@/lib/db/session";
import { publishPost } from "@/lib/publish";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Publishes every scheduled post whose time has come. Run it every few minutes.
// publishPost claims each post, so overlapping runs never double-post.
export async function GET(req: NextRequest) {
  const denied = checkCron(req);
  if (denied) return denied;
  try {
    const db = adminClient();
    if (!db) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
    const deadline = Date.now() + 45_000;
    const { data, error } = await db
      .from("posts")
      .select("id, workspace_id")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .or(`next_publish_at.is.null,next_publish_at.lte.${new Date().toISOString()}`)
      .order("scheduled_at")
      .limit(20);
    if (error) throw error;
    const out = { published: 0, partial: 0, failed: 0, skipped: 0 };
    for (const p of data ?? []) {
      if (Date.now() > deadline) break;
      const r = await publishPost(p.workspace_id as string, p.id as string);
      out[r.status]++;
    }
    return NextResponse.json(out);
  } catch (err) {
    return errorResponse(err, "cron publish");
  }
}
