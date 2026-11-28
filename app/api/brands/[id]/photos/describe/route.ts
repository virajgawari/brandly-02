import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/db/session";
import { requireAi } from "@/lib/db/budget";
import { llmScope } from "@/lib/db/llm-scope";
import { analyseImages, parseJSON } from "@/lib/llm";
import { imageFromStorage } from "@/lib/render/assets";
import { TAG_PROMPT } from "@/lib/brand/describe";
import { ImageTagsSchema } from "@/lib/brand/schemas";

const MAX_PATHS = 12;
const ownPath = (ws: string, brandId: string, path: string) => path.startsWith(`${ws}/brands/${brandId}/photos/`) && !path.includes("..");

/** POST { paths[] } → { items: [{ path, productName, productVisible, tags }] } — one vision call for the whole batch. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const s = await requireAi();
    const body = (await req.json().catch(() => ({}))) as { paths?: unknown };
    const paths = (Array.isArray(body.paths) ? body.paths : [])
      .filter((p): p is string => typeof p === "string" && ownPath(s.workspaceId, id, p))
      .slice(0, MAX_PATHS);
    if (!paths.length) return NextResponse.json({ items: [] });

    const loaded = await Promise.all(paths.map((p) => imageFromStorage(s.db, "images", p, { maxSide: 512 })));
    const usable = paths.map((path, i) => ({ path, uri: loaded[i] })).filter((x): x is { path: string; uri: string } => !!x.uri);
    if (!usable.length) return NextResponse.json({ items: [] });

    let raw: string;
    try {
      raw = await llmScope("photo-describe", { brandId: id }, () =>
        analyseImages(
          usable.map((x) => x.uri.split(",")[1]),
          TAG_PROMPT,
          1200
        )
      );
    } catch (err) {
      // Naming is a nicety: when no vision provider is available (quota, bad key), the photo is still saved.
      console.warn("photo describe unavailable:", err instanceof Error ? err.message.slice(0, 200) : err);
      return NextResponse.json({ items: [], unavailable: true });
    }
    const tags = ImageTagsSchema.parse(parseJSON(raw) ?? []);
    const items = usable.map((x, i) => {
      const t = tags.find((tag) => tag.index === i);
      return { path: x.path, productName: t?.productName ?? "", productVisible: t?.productVisible ?? false, tags: t };
    });
    return NextResponse.json({ items });
  } catch (err) {
    return errorResponse(err, "photo describe");
  }
}
