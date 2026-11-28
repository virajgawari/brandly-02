import { describe, expect, it } from "vitest";
import { profileCompleteness } from "@/lib/brand/completeness";
import type { BrandModel } from "@/lib/brand/model";

const empty = {
  identity: { oneLiner: "" },
  strategy: { offering: "" },
  expression: { tokens: { color: { primary: { $value: "" }, accent: { $value: "" } } } },
  voice: { description: "", sampleLines: [] },
  content: { pillars: [] },
} as unknown as BrandModel;

describe("profileCompleteness", () => {
  it("is 0% for an empty profile and lists everything missing", () => {
    const c = profileCompleteness(empty);
    expect(c.percent).toBe(0);
    expect(c.missing).toHaveLength(c.items.length);
  });
  it("counts filled fields", () => {
    const m = {
      ...empty,
      identity: { oneLiner: "Specialty coffee roasters" },
      voice: { description: "Warm and plain", sampleLines: ["Fresh roast, same day."] },
      content: { pillars: ["Origins", "Brew guides"] },
    } as unknown as BrandModel;
    const c = profileCompleteness(m);
    expect(c.percent).toBe(40);
    expect(c.missing.map((i) => i.key)).not.toContain("voice");
  });
});
