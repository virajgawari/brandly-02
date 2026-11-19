import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/render/muse", () => ({ museEnabled: () => false, museImage: vi.fn() }));
vi.mock("@/lib/n8n", () => ({ n8nEnabled: () => false, n8nRequest: vi.fn() }));

import { pickBrandPhotos, resolvePhoto } from "@/lib/render/media";
import type { BrandModel } from "@/lib/brand/model";
import type { GeneratedPost } from "@/lib/types";
import type { ContentHistory } from "@/lib/content/history";

const photo = (path: string, role?: "product") => ({ path, source: "upload" as const, addedAt: "2026-01-01T00:00:00Z", ...(role ? { role } : {}) });
const model = (photos: ReturnType<typeof photo>[]) => ({ id: "b", expression: { photos } }) as unknown as BrandModel;
const history = (paths: string[] = []) => ({ posts: paths.map((photoPath) => ({ photoPath })) }) as unknown as ContentHistory;
const post = (usesProductPhoto: boolean) => ({ imagePrompt: "x", visualBrief: { usesProductPhoto } }) as unknown as GeneratedPost;

describe("pickBrandPhotos", () => {
  it("returns different photos, least recently used first", () => {
    const m = model([photo("a"), photo("b"), photo("c")]);
    const out = pickBrandPhotos(m, history(["a", "b"]), 2);
    expect(out.map((p) => p.ref)).toEqual(["c", "b"]);
  });
  it("prefers product photos for a product post, falls back to any", () => {
    expect(pickBrandPhotos(model([photo("a"), photo("p", "product")]), history(), 2, true).map((p) => p.ref)).toEqual(["p"]);
    expect(pickBrandPhotos(model([photo("a")]), history(), 1, true).map((p) => p.ref)).toEqual(["a"]);
  });
});

describe("resolvePhoto", () => {
  it("uses the brand's own photo even when the post is not a product post", async () => {
    const out = await resolvePhoto(null, model([photo("a")]), post(false), history(), "1:1" as never);
    expect(out).toEqual({ kind: "brand", ref: "a" });
  });
  it("has nothing to return without photos or an image service", async () => {
    expect(await resolvePhoto(null, model([]), post(false), history(), "1:1" as never)).toBeUndefined();
  });
});
