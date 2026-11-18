import { NextRequest, NextResponse } from "next/server";
import { ManualMetricsSchema } from "@/lib/agent/metrics";
import { errorResponse, requireSession } from "@/lib/db/session";

/** GET → the newest metric snapshot per platform for this post. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const s = await requireSession();
    const { data: pubs, error } = await s.db.from("post_publications").select("id, platform").eq("post_id", id);
    if (error) throw error;
    if (!pubs?.length) return NextResponse.json({ metrics: [] });
    const { data: rows, error: e2 } = await s.db
      .from("post_metrics")
      .select("publication_id, captured_at, impressions, reach, likes, comments, shares, saves, clicks, source")
      .in("publication_id", pubs.map((p) => p.id))
      .order("captured_at", { ascending: false });
    if (e2) throw e2;
    const platformOf = new Map(pubs.map((p) => [p.id, p.platform as string]));
    const seen = new Set<string>();
    const metrics = (rows ?? []).filter((r) => !seen.has(r.publication_id) && !!seen.add(r.publication_id)).map((r) => ({ platform: platformOf.get(r.publication_id), ...r }));
    return NextResponse.json({ metrics });
  } catch (err) {
    return errorResponse(err, "post metrics read");
  }
}

/** POST { platform, reach?, impressions?, likes?, ... } → record a hand-entered snapshot. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = ManualMetricsSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid metrics." }, { status: 400 });
    const s = await requireSession();
    const { data: post, error } = await s.db.from("posts").select("id, status").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const { platform, ...counts } = body.data;
    // One publication per (post, platform); create it the first time numbers are entered.
    const found = await s.db.from("post_publications").select("id").eq("post_id", id).eq("platform", platform).maybeSingle();
    if (found.error) throw found.error;
    let pubId = found.data?.id as string | undefined;
    if (!pubId) {
      const made = await s.db
        .from("post_publications")
        .insert({ post_id: id, workspace_id: s.workspaceId, platform, status: "published", published_at: new Date().toISOString() })
        .select("id")
        .single();
      if (made.error) throw made.error;
      pubId = made.data.id;
    }
    const { error: insErr } = await s.db.from("post_metrics").insert({ publication_id: pubId, workspace_id: s.workspaceId, source: "manual", ...counts });
    if (insErr) throw insErr;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "post metrics write");
  }
}
