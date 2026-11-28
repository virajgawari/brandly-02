import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/db/session";
import { generateLogos } from "@/lib/brand/logo-gen";
import { museEnabled } from "@/lib/render/muse";
import { adminClient } from "@/lib/supabase/admin";
import type { BrandModel } from "@/lib/brand/model";

export const maxDuration = 60;

const HOURLY_LIMIT = 15; // Muse calls per workspace per hour: 5 clicks of 3 options, about $0.15

/** POST { model } → { logos: string[] } of transparent PNG data URIs. Nothing is stored until the owner picks one. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const s = await requireSession();
    const body = (await req.json().catch(() => null)) as { model?: BrandModel } | null;
    const model = body?.model;
    if (!model || model.id !== id) return NextResponse.json({ error: "Missing brand" }, { status: 400 });
    if (!museEnabled()) return NextResponse.json({ error: "Logo generation isn't set up on this server." }, { status: 503 });

    const db = adminClient();
    if (db) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await db
        .from("llm_calls")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", s.workspaceId)
        .eq("feature", "logo")
        .gte("created_at", since);
      if ((count ?? 0) >= HOURLY_LIMIT) {
        return NextResponse.json({ error: "You've generated a lot of logos this hour. Try again later." }, { status: 429 });
      }
    }

    const logos = await generateLogos(model);
    if (!logos.length) return NextResponse.json({ error: "Couldn't make a logo just now. Try again." }, { status: 502 });
    return NextResponse.json({ logos });
  } catch (err) {
    return errorResponse(err, "logo generate");
  }
}
