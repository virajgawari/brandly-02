import { NextRequest, NextResponse } from "next/server";
import { callN8n, n8nEnabled } from "@/lib/n8n";
import { errorResponse, requireEditor } from "@/lib/db/session";
import { postFromRow, POST_SELECT, type PostRow } from "@/lib/db/mappers";
import { publishPost } from "@/lib/publish";

export const maxDuration = 60;

// Body: { postId }. Publishes the stored post right now; the server reads the post itself,
// so the client can't publish content that isn't in the database, and viewers can't publish at all.
// Future-dated posts are published by /api/cron/publish when they fall due.
export async function POST(req: NextRequest) {
  try {
    const s = await requireEditor();
    const body = (await req.json().catch(() => null)) as { postId?: string } | null;
    if (!body?.postId) return NextResponse.json({ error: "postId is required" }, { status: 400 });

    // RLS: only a post in the caller's workspace is visible.
    const { data } = await s.db.from("posts").select(POST_SELECT).eq("id", body.postId).eq("workspace_id", s.workspaceId).maybeSingle();
    if (!data) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    if (n8nEnabled()) return callN8n("publish", { post: postFromRow(data as unknown as PostRow) });

    const out = await publishPost(s.workspaceId, body.postId);
    if (out.status === "skipped") return NextResponse.json({ error: out.error }, { status: 409 });
    if (out.error) return NextResponse.json({ error: out.error, ...out }, { status: out.status === "failed" ? 502 : 200 });
    return NextResponse.json({ postId: body.postId, ...out }, { status: out.status === "failed" ? 502 : 200 });
  } catch (err) {
    return errorResponse(err, "publish");
  }
}
