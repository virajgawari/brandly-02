import { NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/db/session";
import { BRAND_SELECT, POST_SELECT, RULE_SELECT, brandFromRow, postFromRow, ruleFromRow, type BrandRow, type PostRow, type RuleRow } from "@/lib/db/mappers";

// Download-my-data: the workspace's brands, posts and automation rules as one JSON file.
export async function GET() {
  try {
    const s = await requireSession();
    const [brands, posts, rules] = await Promise.all([
      s.db.from("brands").select(BRAND_SELECT).eq("workspace_id", s.workspaceId),
      s.db.from("posts").select(POST_SELECT).eq("workspace_id", s.workspaceId),
      s.db.from("automation_rules").select(RULE_SELECT).eq("workspace_id", s.workspaceId),
    ]);
    for (const r of [brands, posts, rules]) if (r.error) throw r.error;
    const body = {
      exportedAt: new Date().toISOString(),
      brands: (brands.data as unknown as BrandRow[]).map(brandFromRow).filter(Boolean),
      posts: (posts.data as unknown as PostRow[]).map(postFromRow),
      rules: (rules.data as unknown as RuleRow[]).map(ruleFromRow),
    };
    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="brandly-data.json"' },
    });
  } catch (err) {
    return errorResponse(err, "export");
  }
}
