import { describe, expect, it } from "vitest";
import { editRatio } from "@/lib/edit-ratio";

describe("editRatio", () => {
  it("is 0 for identical text", () => expect(editRatio("fresh roast today", "fresh roast today")).toBe(0));
  it("is 1 when one side is empty", () => expect(editRatio("hello world", "")).toBe(1));
  it("is 1 for a full rewrite", () => expect(editRatio("one two three", "four five six")).toBe(1));
  it("counts a single changed word", () => expect(editRatio("a b c d", "a b x d")).toBe(0.25));
  it("ignores whitespace differences", () => expect(editRatio("a  b\nc", "a b c")).toBe(0));
});
