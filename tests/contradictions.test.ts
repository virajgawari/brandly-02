import { describe, expect, it } from "vitest";
import { findContradictions } from "@/lib/brand/contradictions";
import { emptyModel, type BrandModel, type Measures } from "@/lib/brand/model";
import type { TextMeasures } from "@/lib/measure/text";

const text = (o: Partial<TextMeasures> = {}): TextMeasures => ({
  n: 2000, texts: 5,
  sentenceLength: { mean: 25, median: 23, p90: 40 },
  readability: { fleschReadingEase: 35, fleschKincaidGrade: 14 },
  pronouns: null, emojiPer100Words: 0, hashtagsPerText: 0, exclamationPer100Words: 0, questionShare: 0, concreteness: 50,
  ...o,
});
const measures = (o: Partial<TextMeasures> = {}, rating?: Measures["rating"]): Measures => ({ version: "t", at: "", text: text(o), rating });
const model = (set: (m: BrandModel) => void): BrandModel => {
  const m = emptyModel("T", "analyse", "00000000-0000-4000-8000-000000000003");
  set(m);
  return m;
};
const meta = (m: BrandModel, path: string, x: Partial<BrandModel["meta"][string]>) => {
  m.meta[path] = { source: "inferred", method: "llm", confidence: 0.6, locked: false, evidence: [], ...x };
};

describe("findContradictions", () => {
  it("flags casual tone against long, hard sentences", () => {
    const m = model((m) => { m.voice.tone.formal_casual = 80; });
    expect(findContradictions(m, measures()).map((c) => c.id)).toContain("formal-copy");
  });
  it("does not flag when the copy is casual too", () => {
    const m = model((m) => { m.voice.tone.formal_casual = 80; });
    expect(findContradictions(m, measures({ sentenceLength: { mean: 10, median: 9, p90: 18 }, readability: { fleschReadingEase: 75, fleschKincaidGrade: 5 } }))).toEqual([]);
  });
  it("flags formal tone against short, easy sentences", () => {
    const m = model((m) => { m.voice.tone.formal_casual = 20; });
    const r = findContradictions(m, measures({ sentenceLength: { mean: 9, median: 8, p90: 15 }, readability: { fleschReadingEase: 80, fleschKincaidGrade: 4 } }));
    expect(r.map((c) => c.id)).toContain("casual-copy");
  });
  it("flags an enthusiastic tone with no exclamation marks or emoji", () => {
    const m = model((m) => { m.voice.tone.enthusiastic_matter = 15; });
    expect(findContradictions(m, measures()).map((c) => c.id)).toContain("quiet-copy");
  });
  it("skips locked fields", () => {
    const m = model((m) => { m.voice.tone.formal_casual = 80; meta(m, "voice.tone.formal_casual", { locked: true }); });
    expect(findContradictions(m, measures())).toEqual([]);
  });
  it("skips fields that were already rated from the copy", () => {
    const m = model((m) => { m.voice.tone.formal_casual = 80; meta(m, "voice.tone.formal_casual", { method: "rated" }); });
    expect(findContradictions(m, measures())).toEqual([]);
  });
  it("suggests the rated value when the owner's value is far from it", () => {
    const m = model((m) => { m.personality.excitement = 90; meta(m, "personality.excitement", { source: "user", method: "user" }); });
    const rating = { facets: { excitement: { value: 40, interval: [30, 50] as [number, number], runNoise: 3, n: 8, confidence: 0.4 } }, textsRated: 8, calls: 2, failedCalls: 0 };
    const r = findContradictions(m, measures({ exclamationPer100Words: 1, emojiPer100Words: 1 }, rating));
    expect(r).toEqual([expect.objectContaining({ path: "personality.excitement", suggested: 40 })]);
  });
  it("ignores a rating from fewer than 5 texts", () => {
    const m = model((m) => { m.personality.excitement = 90; meta(m, "personality.excitement", { source: "user", method: "user" }); });
    const rating = { facets: { excitement: { value: 40, interval: [30, 50] as [number, number], runNoise: 3, n: 4, confidence: 0.4 } }, textsRated: 4, calls: 2, failedCalls: 0 };
    expect(findContradictions(m, measures({ exclamationPer100Words: 1, emojiPer100Words: 1 }, rating))).toEqual([]);
  });
  it("says nothing when there is too little text", () => {
    const m = model((m) => { m.voice.tone.formal_casual = 80; });
    expect(findContradictions(m, measures({ n: 100 }))).toEqual([]);
  });
});
