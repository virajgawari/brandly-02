import { describe, expect, it } from "vitest";
import { scorePost } from "@/evals/score";

const base = {
  caption: "Lit at 7, still going at 11. Cedar and a little smoke.",
  hashtags: ["#a", "#b", "#c", "#d", "#e"],
  cta: "Order a jar.",
  headline: "Slow evenings",
  platformVariants: { instagram: "x" },
};
const run = (post: Partial<typeof base> | null, extra = {}) =>
  scorePost({ post: post && { ...base, ...post }, banned: ["elevate", "game-changer"], platforms: ["instagram", "twitter"], limits: { instagram: { caption: 2200 }, twitter: { caption: 280 } }, ...extra });

describe("scorePost", () => {
  it("passes a clean post", () => expect(run({}).passed).toBe(true));
  it("fails with no post", () => expect(run(null, { error: "bad json" }).failures[0]).toContain("bad json"));
  it("flags banned phrases", () => expect(run({ caption: "Elevate your evening with a candle." }).scores.noBanned).toBe(false));
  it("uses the tightest platform limit", () => expect(run({ caption: "x".repeat(300) }).scores.captionWithinLimit).toBe(false));
  it("checks hashtag count", () => expect(run({ hashtags: ["#a"] }).scores.hashtagCount).toBe(false));
  it("flags emoji first", () => expect(run({ caption: "🔥 Fresh pour today, cedar and smoke." }).scores.noEmojiFirst).toBe(false));
  it("flags Did you know", () => expect(run({ caption: "Did you know wicks matter? They do a lot." }).scores.noDidYouKnow).toBe(false));
});
