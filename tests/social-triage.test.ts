import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { triage } from "@/lib/social/triage";
import { cleanHandle, mapItem } from "@/lib/social/apify";
import type { SocialPost } from "@/lib/social/types";

const post = (id: string, o: Partial<SocialPost> = {}): SocialPost => ({
  externalId: id,
  timestamp: "2026-10-01T00:00:00Z",
  type: "image",
  caption: "hi",
  hashtags: [],
  mentions: [],
  likes: 0,
  comments: 0,
  views: 0,
  mediaUrls: ["u"],
  ...o,
});

describe("triage", () => {
  it("ranks by likes+comments and tags the top N", () => {
    const out = triage([post("a", { likes: 5 }), post("b", { likes: 50, comments: 5 }), post("c", { likes: 10 })], undefined, 2);
    expect(out.map((p) => p.externalId)).toEqual(["b", "c", "a"]);
    expect(out.map((p) => p.isTop)).toEqual([true, true, false]);
  });
  it("drops duplicates, ads, reposts and empty posts", () => {
    const out = triage([
      post("a"),
      post("a"),
      post("b", { isSponsored: true }),
      post("c", { isRepost: true }),
      post("d", { caption: "", mediaUrls: [] }),
    ]);
    expect(out.map((p) => p.externalId)).toEqual(["a"]);
  });
  it("weights video views down", () => {
    const out = triage([post("v", { type: "video", views: 1000, likes: 0 }), post("i", { likes: 150 })]);
    expect(out[0].externalId).toBe("i");
  });
});

describe("apify mapping", () => {
  it("cleans handles", () => {
    expect(cleanHandle("https://www.instagram.com/acme.co/")).toBe("acme.co");
    expect(cleanHandle("@acme")).toBe("acme");
  });
  it("maps an item and skips ones without id", () => {
    const p = mapItem({
      shortCode: "X1",
      type: "Sidecar",
      caption: "c",
      hashtags: ["a"],
      likesCount: 4,
      commentsCount: -1,
      displayUrl: "u1",
      childPosts: [{ displayUrl: "u2" }, { displayUrl: "u3" }],
    });
    expect(p).toMatchObject({ externalId: "X1", type: "carousel", hashtags: ["#a"], likes: 4, comments: 0 });
    expect(p?.mediaUrls).toEqual(["u1", "u2", "u3"]);
    expect(mapItem({})).toBeNull();
  });
});
