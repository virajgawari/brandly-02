import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({ generateStructured: vi.fn() }));

import { aggregate, pickSamples, quoteInText, rateTexts, shuffled } from "@/lib/measure/rate";

const t = (n: number) => `Text number ${n} has enough words in it to be a usable sample for the judge today`;

describe("quoteInText", () => {
  it("matches ignoring case, spacing and punctuation", () => {
    expect(quoteInText("fresh, honest bread!", "We bake Fresh honest   bread every day.")).toBe(true);
  });
  it("rejects invented quotes and tiny ones", () => {
    expect(quoteInText("luxury experience", "We bake bread every day.")).toBe(false);
    expect(quoteInText("a", "a b c")).toBe(false);
  });
});

describe("pickSamples", () => {
  it("drops short, long and duplicate texts and spreads the pick", () => {
    const texts = [...Array.from({ length: 30 }, (_, i) => t(i)), t(3), "too short", "word ".repeat(200)];
    const picked = pickSamples(texts, 10);
    expect(picked).toHaveLength(10);
    expect(new Set(picked).size).toBe(10);
    expect(picked[0]).toBe(t(0));
    expect(picked[9]).toBe(t(27));
  });
});

describe("shuffled", () => {
  it("is deterministic per seed, differs between seeds, and keeps all items", () => {
    const xs = Array.from({ length: 12 }, (_, i) => i);
    expect(shuffled(xs, 1)).toEqual(shuffled(xs, 1));
    expect(shuffled(xs, 1)).not.toEqual(shuffled(xs, 2));
    expect([...shuffled(xs, 5)].sort((a, b) => a - b)).toEqual(xs);
  });
});

describe("aggregate", () => {
  it("takes the median across runs per text, then the mean across texts", () => {
    const runs = [
      [{ sincerity: 80 }, { sincerity: 40 }],
      [{ sincerity: 60 }, { sincerity: 40 }],
      [{ sincerity: 100 }, { sincerity: 40 }],
    ];
    const r = aggregate(runs, 2).sincerity!;
    expect(r.value).toBe(60); // (median 80 + median 40) / 2
    expect(r.n).toBe(2);
    expect(r.runNoise).toBeGreaterThan(0);
  });

  it("gives low confidence to noisy or sparse scores and skips unscored facets", () => {
    const steady = aggregate(Array.from({ length: 2 }, () => Array.from({ length: 10 }, () => ({ excitement: 70 }))), 10).excitement!;
    const noisy = aggregate([Array.from({ length: 10 }, () => ({ excitement: 10 })), Array.from({ length: 10 }, () => ({ excitement: 90 }))], 10).excitement!;
    expect(steady.confidence).toBeGreaterThan(noisy.confidence);
    expect(steady.confidence).toBeGreaterThan(0.9);
    expect(aggregate([[{}]], 1).ruggedness).toBeUndefined();
  });
});

describe("rateTexts", () => {
  const texts = Array.from({ length: 4 }, (_, i) => t(i));

  it("keeps quoted scores, drops unquoted ones, and combines runs", async () => {
    const judge = vi.fn(async (batch: string[]) => ({
      ratings: batch.map((_, i) => ({
        id: i + 1,
        sincerity: { score: 80, quote: "usable sample" },
        excitement: { score: 90, quote: "totally invented words" },
      })),
    }));
    const rep = await rateTexts(texts, { samples: 4, runs: 2, batchSize: 2, delayMs: 0, judge });
    expect(judge).toHaveBeenCalledTimes(4); // 2 runs x 2 batches
    expect(rep.ratings.sincerity?.value).toBe(80);
    expect(rep.ratings.excitement).toBeUndefined();
    expect(rep.droppedUnquoted).toBe(8); // excitement: 4 texts x 2 runs
  });

  it("survives a failed batch and reports it", async () => {
    let n = 0;
    const judge = async (batch: string[]) => {
      if (n++ === 0) throw new Error("429 rate limit");
      return { ratings: batch.map((_, i) => ({ id: i + 1, competence: { score: 70, quote: "usable sample" } })) };
    };
    const rep = await rateTexts(texts, { samples: 4, runs: 1, batchSize: 2, delayMs: 0, judge });
    expect(rep.failedCalls).toBe(1);
    expect(rep.ratings.competence?.n).toBe(2);
  });

  it("ignores ids outside the batch", async () => {
    const judge = async () => ({ ratings: [{ id: 99, sincerity: { score: 50, quote: "usable sample" } }] });
    const rep = await rateTexts(texts, { samples: 4, runs: 1, batchSize: 4, delayMs: 0, judge });
    expect(rep.ratings.sincerity).toBeUndefined();
  });
});
