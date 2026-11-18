import { describe, expect, it } from "vitest";
import { emptyModel } from "@/lib/brand/model";
import { compareFit, judgeFit } from "@/lib/judge/fit";

const model = emptyModel("Test", "build"); // sincerity 50, excitement 50, competence 50, formal_casual 50 ...
const TEXT = "Cold brew poured slow at six every morning";

describe("compareFit", () => {
  it("computes fit from the mean gap", () => {
    const r = compareFit(model, {
      sincerity: { score: 60, quote: "x" },
      excitement: { score: 40, quote: "x" },
      competence: { score: 50, quote: "x" },
    });
    expect(r.status).toBe("ok");
    expect(r.fit).toBe(93); // mean |gap| = 6.67
    expect(r.passed).toBe(true);
  });
  it("fails when one facet is far off", () => {
    const r = compareFit(model, {
      sincerity: { score: 95, quote: "x" },
      excitement: { score: 50, quote: "x" },
      competence: { score: 50, quote: "x" },
    });
    expect(r.offFacets).toEqual(["sincerity"]);
    expect(r.passed).toBe(false);
  });
  it("is unsure with fewer than 3 facets, and passes", () => {
    const r = compareFit(model, { sincerity: { score: 0, quote: "x" } });
    expect(r.status).toBe("unsure");
    expect(r.passed).toBe(true);
  });
});

const reply = (ratings: Record<string, unknown>) => async () => ({ ratings: [{ id: 1, ...ratings }] }) as never;

describe("judgeFit", () => {
  it("keeps quotes and drops unquoted scores", async () => {
    const r = await judgeFit(TEXT, model, {
      judge: reply({
        sincerity: { score: 50, quote: "Cold brew" },
        excitement: { score: 50, quote: "poured slow" },
        competence: { score: 50, quote: "every morning" },
        ruggedness: { score: 99, quote: "not in the text" },
      }),
    });
    expect(r.facets.map((f) => f.facet)).toEqual(["sincerity", "excitement", "competence"]);
    expect(r.facets[0].quote).toBe("Cold brew");
  });
  it("is skipped when the judge throws", async () => {
    const r = await judgeFit(TEXT, model, { judge: async () => { throw new Error("429"); } });
    expect(r.status).toBe("skipped");
    expect(r.passed).toBe(true);
  });
});
