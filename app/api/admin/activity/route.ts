import { NextResponse } from "next/server";
import { adminError, requireAdmin } from "@/lib/agent/admin";

/** GET → everything that happened for the workspace: scrapes, AI calls (text + image), brand data. Admins only. */
export async function GET(req: Request) {
  try {
    const s = await requireAdmin();
    const url = new URL(req.url);
    const brandId = url.searchParams.get("brand");
    const only = (q: any) => (brandId ? q.eq("brand_id", brandId) : q);

    const [scrapes, calls, brands] = await Promise.all([
      only(s.db.from("jobs").select("id, brand_id, status, payload, result, error, attempts, created_at, updated_at, brands(name)").eq("workspace_id", s.workspaceId).eq("kind", "social.scrape")).order("created_at", { ascending: false }).limit(30),
      only(s.db.from("llm_calls").select("id, brand_id, feature, task, provider, model, input, output, parsed_ok, input_tokens, output_tokens, cost_usd, latency_ms, attempts, fallback_from, error, created_at, brands(name)").eq("workspace_id", s.workspaceId)).order("created_at", { ascending: false }).limit(150),
      s.db.from("brands").select("id, name, sources, current_version_id, created_at, brand_versions!brands_current_version_fk(version, model, source, created_at)").eq("workspace_id", s.workspaceId).is("archived_at", null).order("created_at", { ascending: false }),
    ]);
    for (const r of [scrapes, calls, brands]) if (r.error) throw r.error;

    const posts = await s.db.from("social_posts").select("brand_id, is_top").eq("workspace_id", s.workspaceId);
    const counts: Record<string, { total: number; top: number }> = {};
    for (const p of posts.data ?? []) {
      const c = (counts[p.brand_id] ??= { total: 0, top: 0 });
      c.total++;
      if (p.is_top) c.top++;
    }
    const list = calls.data ?? [];
    return NextResponse.json({
      scrapes: (scrapes.data ?? []).map((j: any) => ({ ...j, payload: { handle: j.payload?.handle, runId: j.payload?.runId } })),
      calls: list,
      brands: (brands.data ?? []).map((b: any) => ({ ...b, socialPosts: counts[b.id] ?? { total: 0, top: 0 } })),
      totals: {
        calls: list.length,
        images: list.filter((c: any) => c.task === "image").length,
        usd: list.reduce((a: number, c: any) => a + Number(c.cost_usd ?? 0), 0),
        errors: list.filter((c: any) => c.error).length,
      },
    });
  } catch (err) {
    return adminError(err, "admin activity");
  }
}
