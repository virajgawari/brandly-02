import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { pickBrief } from "@/lib/content/brief";
import { dedupeTags } from "@/lib/content/prompt";
import { emptyModel } from "@/lib/brand/model";

const EMPTY = { posts: [], dislikes: { formats: {}, layouts: {} } } as never;
const GATED = ["offer", "mini-story", "single-stat", "behind-the-scenes", "product-spotlight"];

describe("format gating", () => {
  it("never picks fact-hungry formats when no facts are on file", () => {
    const model = emptyModel("Test", "consumer" as never);
    for (let i = 0; i < 60; i++) {
      const b = pickBrief(model, EMPTY, undefined, { request: "" });
      expect(GATED).not.toContain(b.format.id);
    }
  });
  it("allows offer when the request supplies details", () => {
    let seen = false;
    for (let i = 0; i < 300; i++) {
      if (pickBrief(undefined as never, EMPTY, "seasonal", { request: "Diwali offer: 10% off beans until Sunday" }).format.id === "offer") seen = true;
    }
    expect(seen).toBe(true);
  });
});

describe("dedupeTags", () => {
  it("drops case-insensitive repeats", () => {
    expect(dedupeTags(["#Coffee", "#cafe", "#coffee", "#CAFE", "#roast"])).toEqual(["#Coffee", "#cafe", "#roast"]);
  });
});
