import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { feedRules, POST_PROMPT_VERSION } from "@/lib/content/prompt";

const pb = {
  pillars: [],
  adjectives: ["warm", "plain"],
  neverSoundsLike: "a press release",
  hookFormulas: [],
  formatting: { avgWords: 18, lineBreaks: "short separate lines", emoji: "1-2 per post" },
  cta: "ends with a soft invitation",
  hashtagRule: "",
  blacklist: [],
  anchors: [],
};

describe("feedRules", () => {
  it("is empty without a playbook", () => {
    expect(feedRules(undefined)).toEqual([]);
  });
  it("carries the learned habits", () => {
    const text = feedRules(pb).join("\n");
    expect(text).toContain("about 18 words");
    expect(text).toContain("short separate lines");
    expect(text).toContain("1-2 per post");
    expect(text).toContain("soft invitation");
    expect(text).toContain("a press release");
  });
  it("is versioned", () => {
    expect(POST_PROMPT_VERSION).toBe("generate-post@7");
  });
});
