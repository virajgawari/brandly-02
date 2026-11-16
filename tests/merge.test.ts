import { describe, expect, it } from "vitest";
import { emptyModel } from "@/lib/brand/model";
import { isLocked, mergePatch, setLock } from "@/lib/brand/merge";

const base = () => emptyModel("Test Co", "build", "00000000-0000-4000-8000-000000000001");

describe("mergePatch", () => {
  it("applies a patch and bumps the version", () => {
    const r = mergePatch(base(), { strategy: { offering: "candles" } }, { source: "inferred", confidence: 0.6 });
    expect(r.model.strategy.offering).toBe("candles");
    expect(r.model.version).toBe(2);
    expect(r.applied).toContain("strategy.offering");
    expect(r.model.meta["strategy.offering"]).toMatchObject({ source: "inferred", confidence: 0.6 });
  });

  it("skips empty values", () => {
    const r = mergePatch(base(), { strategy: { offering: "  ", differentiators: [] } }, { source: "inferred", confidence: 0.6 });
    expect(r.applied).toEqual([]);
    expect(r.model.version).toBe(1);
  });

  it("never overwrites a locked field unless the user does it", () => {
    let m = mergePatch(base(), { strategy: { offering: "candles" } }, { source: "user", confidence: 1 }).model;
    m = setLock(m, "strategy.offering", true);
    expect(isLocked(m, "strategy.offering")).toBe(true);
    const ai = mergePatch(m, { strategy: { offering: "soap" } }, { source: "inferred", confidence: 0.9 });
    expect(ai.skippedLocked).toContain("strategy.offering");
    expect(ai.model.strategy.offering).toBe("candles");
    const user = mergePatch(m, { strategy: { offering: "soap" } }, { source: "user", confidence: 1 });
    expect(user.model.strategy.offering).toBe("soap");
  });

  it("a locked parent path locks its children", () => {
    const m = setLock(base(), "strategy.audience", true);
    expect(isLocked(m, "strategy.audience.psychographic")).toBe(true);
  });

  it("does not let a less confident value replace a more confident one", () => {
    const m = mergePatch(base(), { strategy: { industry: "food_beverage" } }, { source: "extracted", confidence: 0.9 }).model;
    const r = mergePatch(m, { strategy: { industry: "other" } }, { source: "inferred", confidence: 0.4 });
    expect(r.skippedLowerConfidence).toContain("strategy.industry");
    expect(r.model.strategy.industry).toBe("food_beverage");
  });

  it("user edits always win and are recorded at confidence 1", () => {
    const m = mergePatch(base(), { strategy: { industry: "food_beverage" } }, { source: "extracted", confidence: 0.9 }).model;
    const r = mergePatch(m, { strategy: { industry: "other" } }, { source: "user", confidence: 0.2 });
    expect(r.model.strategy.industry).toBe("other");
    expect(r.model.meta["strategy.industry"].confidence).toBe(1);
  });

  it("does not mutate the input model", () => {
    const m = base();
    mergePatch(m, { strategy: { offering: "candles" } }, { source: "user", confidence: 1 });
    expect(m.strategy.offering).toBe("");
  });
});
