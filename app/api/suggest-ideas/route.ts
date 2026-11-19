import { NextRequest, NextResponse } from "next/server";
import { generateStructured } from "@/lib/llm";
import { cleanIdeas, buildIdeasPrompt, IDEAS_PROMPT_VERSION, IDEAS_SYSTEM, IdeasSchema } from "@/lib/content/ideas";
import { recentPosts } from "@/lib/content/history";
import { learnedBlock } from "@/lib/agent/stats";
import { llmScope } from "@/lib/db/llm-scope";
import { errorResponse, requireSession } from "@/lib/db/session";
import { adminClient } from "@/lib/supabase/admin";
import type { BrandModel } from "@/lib/brand/model";

export const maxDuration = 30;

const HOURLY_LIMIT = 20; // one cheap-tier call per click

/** POST { brandModel } → { ideas: [{ title, pitch, template }] } built from the brand profile and recent posts. */
export async function POST(req: NextRequest) {
  try {
    const s = await requireSession();
    const body = (await req.json().catch(() => null)) as { brandModel?: BrandModel } | null;
    const model = body?.brandModel;
    if (!model?.strategy || !model.name) return NextResponse.json({ error: "brandModel is required" }, { status: 400 });

    const db = adminClient();
    if (db) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await db
        .from("llm_calls")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", s.workspaceId)
        .eq("feature", "suggest-ideas")
        .gte("created_at", since);
      if ((count ?? 0) >= HOURLY_LIMIT) {
        return NextResponse.json({ error: "You've asked for a lot of ideas this hour. Try again later." }, { status: 429 });
      }
    }

    const history = await recentPosts(model.id, 10, s);
    const out = await llmScope("suggest-ideas", { brandId: model.id, promptVersion: IDEAS_PROMPT_VERSION }, () =>
      generateStructured(IdeasSchema, IDEAS_SYSTEM, buildIdeasPrompt(model, history.posts.map((p) => p.opening).filter(Boolean), learnedBlock(history.learned ?? [])), {
        task: "fast",
        maxTokens: 700,
        temperature: 0.9,
      })
    );
    const ideas = cleanIdeas(out.ideas);
    if (!ideas.length) return NextResponse.json({ error: "Couldn't think of ideas just now. Try again." }, { status: 502 });
    return NextResponse.json({ ideas });
  } catch (err) {
    return errorResponse(err, "suggest-ideas");
  }
}
