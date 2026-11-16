import { describe, expect, it } from "vitest";
import { contrastRatio, readableOn, wcagLevel, normalizeHex } from "@/lib/brand/color";

describe("color", () => {
  it("black on white is 21:1", () => expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0));
  it("is symmetric", () => expect(contrastRatio("#336699", "#FFFFFF")).toBeCloseTo(contrastRatio("#FFFFFF", "#336699"), 5));
  it("maps ratios to WCAG levels", () => {
    expect(wcagLevel(7)).toBe("AAA");
    expect(wcagLevel(4.5)).toBe("AA");
    expect(wcagLevel(3)).toBe("AA Large");
    expect(wcagLevel(2.9)).toBe("Fail");
  });
  it("picks readable text colour", () => {
    expect(readableOn("#000000")).toBe("#FFFFFF");
    expect(readableOn("#FFFFFF")).toBe("#111111");
  });
  it("rejects invalid hex", () => expect(normalizeHex("zzz")).toBeNull());
});
