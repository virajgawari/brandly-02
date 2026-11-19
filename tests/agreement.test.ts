import { describe, expect, it } from "vitest";
import { agreement, spearman } from "@/lib/measure/agreement";

describe("spearman", () => {
  it("is 1 for the same order and -1 for the reverse", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
  });
  it("needs three points", () => {
    expect(spearman([1, 2], [1, 2])).toBeNull();
  });
  it("copes with ties and a flat series", () => {
    expect(spearman([1, 1, 2, 3], [5, 5, 6, 9])).toBeCloseTo(1);
    expect(spearman([1, 2, 3], [5, 5, 5])).toBeNull();
  });
});

describe("agreement", () => {
  const labels = [{ excitement: 90 }, { excitement: 10 }, { excitement: 50 }, {}];
  it("averages runs, counts coverage and skips unlabelled texts", () => {
    const perRun = [
      [{ excitement: 80 }, { excitement: 20 }, {}, { excitement: 99 }],
      [{ excitement: 90 }, { excitement: 10 }, {}, {}],
    ];
    const a = agreement(labels, perRun).excitement;
    expect(a.labelled).toBe(3);
    expect(a.scored).toBe(2);
    expect(a.coverage).toBeCloseTo(2 / 3);
    expect(a.mae).toBeCloseTo(5);
    expect(a.within15).toBe(1);
  });
  it("reports nothing for a facet with no labels", () => {
    const a = agreement(labels, [[{}, {}, {}, {}]]).ruggedness;
    expect(a).toMatchObject({ labelled: 0, scored: 0, mae: null, spearman: null });
  });
});
