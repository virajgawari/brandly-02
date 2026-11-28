import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/db/session";
import { enqueueAndKick } from "@/lib/jobs/queue";
import { apifyEnabled, cleanHandle } from "@/lib/social/apify";
import { listAllSocialPosts, listTopSocialPosts } from "@/lib/social/store";

// GET returns the scraped-post count and the top posts (with image URLs) for the brand page.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession();
    const { id } = await params;
    if (req.nextUrl.searchParams.get("all") === "1") {
      const all = await listAllSocialPosts(s.db, s.workspaceId, id);
      return NextResponse.json({ enabled: apifyEnabled(), count: all.length, posts: all });
    }
    return NextResponse.json({ enabled: apifyEnabled(), ...(await listTopSocialPosts(s.db, s.workspaceId, id)) });
  } catch (err) {
    return errorResponse(err, "social posts");
  }
}

// POST { handle } starts a scrape job for this brand's Instagram and returns { jobId }.
// Poll GET /api/jobs/{jobId}; when it is done, run the `social` pipeline to build the style guide and playbook.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession();
    const { id } = await params;
    if (!apifyEnabled()) return NextResponse.json({ error: "Instagram scraping isn't set up (APIFY_TOKEN)." }, { status: 501 });
    const body = (await req.json().catch(() => ({}))) as { handle?: string; followers?: number };
    const handle = cleanHandle(body.handle ?? "");
    if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return NextResponse.json({ error: "Enter a valid Instagram handle." }, { status: 400 });
    // RLS: only a brand in the user's workspace is visible here.
    const { data: brand } = await s.db.from("brands").select("id").eq("id", id).eq("workspace_id", s.workspaceId).maybeSingle();
    if (!brand) return NextResponse.json({ error: "Save the brand first." }, { status: 404 });
    const jobId = await enqueueAndKick({
      kind: "social.scrape",
      workspaceId: s.workspaceId,
      brandId: id,
      createdBy: s.userId,
      dedupeKey: `social.scrape:${id}`,
      maxAttempts: 8,
      payload: { handle, ...(typeof body.followers === "number" ? { followers: body.followers } : {}) },
    });
    return NextResponse.json({ jobId });
  } catch (err) {
    return errorResponse(err, "social scrape");
  }
}
