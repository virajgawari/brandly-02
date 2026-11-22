import { describe, expect, it } from "vitest";
import { DEFAULT_HASHTAGS, parseHashtagRule, rangeText } from "@/lib/content/hashtags";

describe("parseHashtagRule", () => {
  it("defaults when empty or number-free", () => {
    expect(parseHashtagRule("")).toEqual(DEFAULT_HASHTAGS);
    expect(parseHashtagRule(undefined)).toEqual(DEFAULT_HASHTAGS);
    expect(parseHashtagRule("a few relevant tags")).toEqual(DEFAULT_HASHTAGS);
  });
  it("reads ranges and single counts", () => {
    expect(parseHashtagRule("3-5 hashtags at the end")).toEqual({ min: 3, max: 5 });
    expect(parseHashtagRule("1 hashtag at the end")).toEqual({ min: 1, max: 1 });
    expect(parseHashtagRule("three tags")).toEqual({ min: 3, max: 3 });
  });
  it("reads 'none' and 'up to'", () => {
    expect(parseHashtagRule("no hashtags")).toEqual({ min: 0, max: 0 });
    expect(parseHashtagRule("up to 4 hashtags")).toEqual({ min: 1, max: 4 });
  });
  it("describes the range", () => {
    expect(rangeText({ min: 0, max: 0 })).toBe("none");
    expect(rangeText({ min: 2, max: 2 })).toBe("exactly 2");
    expect(rangeText({ min: 3, max: 5 })).toBe("3-5");
  });
});
