import { describe, expect, it } from "vitest";
import { bestTimeLabel, computePostStats } from "@/lib/social/stats";
import { pickText } from "@/lib/render/layouts/shared";
import { peopleClause } from "@/lib/content/visual";
import type { ScoredPost } from "@/lib/social/types";

function post(i: number, over: Partial<ScoredPost> = {}): ScoredPost {
  return {
    externalId: `p${i}`,
    timestamp: "2026-03-03T14:00:00Z", // Tuesday 14:00 UTC
    type: "image",
    caption: "one two three four five",
    hashtags: [],
    mentions: [],
    likes: 10,
    comments: 1,
    views: 0,
    mediaUrls: [],
    engagementScore: 1,
    isTop: false,
    ...over,
  };
}

describe("computePostStats", () => {
  it("returns undefined with fewer than 5 posts", () => {
    expect(computePostStats([post(1), post(2)])).toBeUndefined();
  });

  it("counts words, emoji, hashtags and mentions", () => {
    const posts = [
      post(1, { caption: "hello world ☕", hashtags: ["#Brew", "#Cafe"], mentions: ["a"] }),
      post(2, { caption: "hello world", hashtags: ["brew"] }),
      post(3, { caption: "hello world" }),
      post(4, { caption: "hello world" }),
      post(5, { caption: "hello world\n\nmore" }),
    ];
    const s = computePostStats(posts)!;
    expect(s.sampleSize).toBe(5);
    expect(s.words.median).toBe(2);
    expect(s.emoji.usedPct).toBe(20);
    expect(s.emoji.median).toBe(0);
    expect(s.mentionPct).toBe(20);
    expect(s.lineBreakPct).toBe(20);
    expect(s.hashtags.top).toEqual(["#brew"]);
  });

  it("finds best day and hour in the given time zone", () => {
    const posts = Array.from({ length: 6 }, (_, i) => post(i, { engagementScore: 5 }));
    posts.push(post(9, { timestamp: "2026-03-05T03:00:00Z", engagementScore: 0 }));
    const utc = computePostStats(posts)!;
    expect(utc.bestDays[0]).toBe(2);
    expect(utc.bestHours[0]).toBe(14);
    const ist = computePostStats(posts, "Asia/Kolkata")!;
    expect(ist.bestHours[0]).toBe(19); // 14:00 UTC = 19:30 IST
  });

  it("ranks post types and caption lengths by engagement", () => {
    const words = (n: number) => Array.from({ length: n }, () => "w").join(" ");
    const posts = [
      post(1, { type: "carousel", engagementScore: 9, caption: words(30) }),
      post(2, { type: "carousel", engagementScore: 9, caption: words(31) }),
      post(3, { type: "image", engagementScore: 1, caption: words(2) }),
      post(4, { type: "image", engagementScore: 1, caption: words(3) }),
      post(5, { type: "image", engagementScore: 1, caption: words(10) }),
      post(6, { type: "image", engagementScore: 1, caption: words(11) }),
    ];
    const s = computePostStats(posts)!;
    expect(s.engagementByType.carousel).toBeGreaterThan(s.engagementByType.image!);
    expect(s.bestLength).toBe("long");
  });
});

describe("bestTimeLabel", () => {
  it("is empty when unknown and formatted when known", () => {
    expect(bestTimeLabel(undefined)).toBe("");
    const s = computePostStats(Array.from({ length: 6 }, (_, i) => post(i)))!;
    expect(bestTimeLabel(s)).toBe("Tue 2pm");
  });
});

describe("pickText", () => {
  const props = (textColor?: string) => ({ textColor }) as never;

  it("uses the learned colour when it is on the same side and readable", () => {
    expect(pickText(props("#F5F5F5"), "#FFFFFF", "#000000")).toBe("#F5F5F5");
  });

  it("falls back when contrast is too low", () => {
    expect(pickText(props("#FFFFFF"), "#FFFFFF", "#EEEEEE")).toBe("#FFFFFF");
    expect(pickText(props("#777777"), "#000000", "#FFFFFF")).toBe("#000000");
  });

  it("falls back when the learned colour is on the other side", () => {
    expect(pickText(props("#000000"), "#FFFFFF", "#222222")).toBe("#FFFFFF");
  });

  it("keeps the default when nothing was learned", () => {
    expect(pickText(props(undefined), "#FFFFFF")).toBe("#FFFFFF");
  });
});

describe("peopleClause", () => {
  it("is empty without a learned share", () => {
    expect(peopleClause(undefined)).toBe("");
    expect(peopleClause({} as never)).toBe("");
  });

  it("includes a person when the roll lands under the share", () => {
    const g = { peoplePct: 60, peopleStyle: "candid portraits" } as never;
    expect(peopleClause(g, () => 0.1)).toContain("candid portraits");
    expect(peopleClause(g, () => 0.9)).toBe("");
  });

  it("forbids people when the feed rarely shows them", () => {
    expect(peopleClause({ peoplePct: 5 } as never, () => 0.9)).toBe("No people in the frame.");
  });
});
