import { describe, expect, it } from "vitest";
import { emojiRange, scoreFeedMatch, wantsLineBreaks } from "@/lib/judge/feed";
import type { Playbook } from "@/lib/brand/model";

const pb: Playbook = {
  pillars: [],
  adjectives: [],
  neverSoundsLike: "",
  hookFormulas: [],
  formatting: { avgWords: 20, lineBreaks: "short lines with a line break after each sentence", emoji: "none" },
  cta: "ends with a soft invitation",
  hashtagRule: "3 hashtags at the end",
  blacklist: ["amazing"],
  formatMix: [{ format: "opinion", pct: 50 }],
  anchors: [],
};
const good = { caption: "We roast in small batches.\nEvery week.\nCome taste the difference with us today friends.", hashtags: ["#a", "#b", "#c"], cta: "Visit us", format: "opinion" };

describe("feed match", () => {
  it("is unavailable without a playbook", () => {
    expect(scoreFeedMatch(good, undefined).status).toBe("unavailable");
  });
  it("scores a post that follows the feed high", () => {
    const r = scoreFeedMatch(good, pb);
    expect(r.status).toBe("ok");
    expect(r.score).toBeGreaterThan(85);
  });
  it("penalises emoji, hashtags, wrong format and avoided words", () => {
    const bad = { caption: "Amazing 🔥🔥🔥 coffee " + "word ".repeat(80), hashtags: ["#a"], format: "mini-story" };
    const r = scoreFeedMatch(bad, pb);
    expect(r.score).toBeLessThan(50);
    expect(r.parts.find((p) => p.id === "words")!.score).toBeLessThan(100);
    expect(r.parts.every((p) => p.score >= 0 && p.score <= 100)).toBe(true);
  });
  it("reads emoji and line-break habits", () => {
    expect(emojiRange("none")).toEqual({ min: 0, max: 0 });
    expect(emojiRange("1-2 per post")).toEqual({ min: 1, max: 2 });
    expect(emojiRange("")).toBeUndefined();
    expect(wantsLineBreaks("single block, no line breaks")).toBe(false);
    expect(wantsLineBreaks("short lines")).toBe(true);
    expect(wantsLineBreaks("whatever")).toBeUndefined();
  });
});
