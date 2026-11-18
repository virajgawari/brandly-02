import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/render/muse", () => ({
  museEnabled: () => false,
  museImage: vi.fn(),
}));
vi.mock("@/lib/n8n", () => ({
  n8nEnabled: () => true,
  n8nRequest: vi.fn(async (_: string, body: { prompt: string }) => ({ status: 200, data: { imageUrl: `https://img/${body.prompt.match(/slide \d/)?.[0].replace(" ", "-")}` } })),
}));

import { fillSlidePhotos, generateSlidePhotos, slidePrompt } from "@/lib/render/media";
import type { BrandModel } from "@/lib/brand/model";
import type { GeneratedPost } from "@/lib/types";

const post = {
  imagePrompt: "Cafe table, warm light.",
  slides: [
    { headline: "One", body: "first" },
    { headline: "Two", body: "second" },
    { headline: "Three" },
  ],
} as unknown as GeneratedPost;
const model = { id: "b1" } as unknown as BrandModel;

describe("slidePrompt", () => {
  it("includes the brief, the slide number and what the slide says", () => {
    const p = slidePrompt(post, 1);
    expect(p).toContain("Cafe table, warm light.");
    expect(p).toContain("slide 2 of 3");
    expect(p).toContain("Two — second");
  });
  it("copes with a missing brief or slide", () => {
    expect(slidePrompt({ slides: [] } as unknown as GeneratedPost, 0)).toContain("slide 1 of 0");
  });
});

describe("fillSlidePhotos", () => {
  it("returns nothing when there are no photos", () => {
    expect(fillSlidePhotos([undefined, null], 4)).toEqual([]);
  });
  it("keeps given photos and cycles them into the gaps", () => {
    expect(fillSlidePhotos(["a", undefined, "c"], 5)).toEqual(["a", "c", "c", "c", "a"]);
  });
  it("uses one photo for every slide", () => {
    expect(fillSlidePhotos(["a"], 3)).toEqual(["a", "a", "a"]);
  });
});

describe("generateSlidePhotos", () => {
  it("makes one photo per slide, each with its own prompt", async () => {
    const out = await generateSlidePhotos(null, model, post, "4:5");
    expect(out).toHaveLength(3);
    expect(out.every((p) => p?.kind === "generated")).toBe(true);
    expect(new Set(out.map((p) => p?.ref)).size).toBe(3);
  });
  it("makes nothing for a post without slides", async () => {
    expect(await generateSlidePhotos(null, model, { imagePrompt: "x" } as unknown as GeneratedPost, "4:5")).toEqual([]);
  });
});
