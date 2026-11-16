import { describe, expect, it } from "vitest";
import { emptyModel, MODEL_SCHEMA_VERSION, type BrandModel } from "@/lib/brand/model";
import { effectiveTone, personalityToUnit, signedToTone, toneToSigned, unitToPct, pctToUnit } from "@/lib/brand/scale";
import { upgradeModel } from "@/lib/brand/upgrade";
import { mergePatch } from "@/lib/brand/merge";

const v1 = (): BrandModel => {
  const m = emptyModel("Old Co", "build", "00000000-0000-4000-8000-000000000002") as unknown as Record<string, any>;
  m.schemaVersion = 1;
  m.personality = Object.fromEntries(Object.keys(m.personality).map((k) => [k, 0.5]));
  m.personality[Object.keys(m.personality)[0]] = 0.8;
  m.voice.tone = { funny_serious: -1, formal_casual: 0, respectful_irreverent: 0.5, enthusiastic_matter: 1 };
  m.evidence = [{ source: "website", url: "https://x.test", text: "hi" }];
  m.meta = { "personality.warmth": { source: "inferred", confidence: 0.6, evidence: "from site" } };
  return m as unknown as BrandModel;
};

describe("scale helpers", () => {
  it("round-trips unit and tone scales", () => {
    expect(unitToPct(0.8)).toBe(80);
    expect(pctToUnit(80)).toBe(0.8);
    expect(signedToTone(-1)).toBe(0);
    expect(signedToTone(0)).toBe(50);
    expect(signedToTone(1)).toBe(100);
    expect(toneToSigned(50)).toBe(0);
    expect(personalityToUnit({ a: 50 } as any)).toEqual({ a: 0.5 });
  });

  it("applies per-platform tone overrides", () => {
    const m = emptyModel("T", "build");
    m.voice.toneByPlatform = { linkedin: { formal_casual: 10 } } as any;
    expect(effectiveTone(m, "linkedin" as any).formal_casual).toBe(10);
    expect(effectiveTone(m).formal_casual).toBe(m.voice.tone.formal_casual);
  });
});

describe("upgradeModel", () => {
  it("rescales a v1 model to v2", () => {
    const u = upgradeModel(v1());
    expect(u.schemaVersion).toBe(MODEL_SCHEMA_VERSION);
    expect(Object.values(u.personality).every((x) => x >= 0 && x <= 100)).toBe(true);
    expect(u.voice.tone).toEqual({ funny_serious: 0, formal_casual: 50, respectful_irreverent: 75, enthusiastic_matter: 100 });
    expect(u.evidence[0].id).toBeTruthy();
    expect(u.meta["personality.warmth"].note).toBe("from site");
    expect(u.meta["personality.warmth"].evidence).toEqual([]);
  });

  it("is idempotent and leaves v2 untouched", () => {
    const u = upgradeModel(v1());
    expect(upgradeModel(u)).toBe(u);
    const fresh = emptyModel("N", "build");
    expect(upgradeModel(fresh)).toBe(fresh);
  });
});

describe("merge field records", () => {
  it("stores method, platform and evidence ids on meta", () => {
    const r = mergePatch(emptyModel("T", "build"), { strategy: { offering: "candles" } }, {
      source: "inferred", confidence: 0.7, method: "llm", evidenceByPath: { "strategy.offering": ["ev1"] },
    } as any);
    expect(r.model.meta["strategy.offering"]).toMatchObject({ method: "llm", evidence: ["ev1"] });
  });
});
