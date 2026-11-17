import { describe, expect, it } from "vitest";
import { logOdds } from "@/lib/measure/lexicon";
import { measureText, wordCounts } from "@/lib/measure/text";
import { sentences, syllables, words } from "@/lib/measure/tokenize";

describe("tokenize", () => {
  it("counts syllables", () => {
    const known: Record<string, number> = {
      cat: 1, table: 2, water: 2, happy: 2, beautiful: 3, innovation: 4, make: 1, jumped: 1, little: 2, banana: 3, the: 1, create: 2,
    };
    const off = Object.entries(known).filter(([w, n]) => syllables(w) !== n);
    // Heuristic: allow at most two misses, each off by one.
    expect(off.length).toBeLessThanOrEqual(2);
    for (const [w, n] of off) expect(Math.abs(syllables(w) - n)).toBe(1);
  });

  it("keeps abbreviations inside one sentence and drops URLs", () => {
    expect(sentences("Use e.g. honey. Then stir! Why? See https://x.com/a.b now")).toHaveLength(4);
    expect(words("Visit https://x.com now #sale @bob Hello's")).toEqual(["visit", "now", "hello's"]);
  });

  it("handles Devanagari words", () => {
    expect(words("हमारा घर")).toEqual(["हमारा", "घर"]);
  });
});

describe("measureText", () => {
  it("scores Flesch on a text with a hand-computed value", () => {
    // 36 monosyllabic words in 6 sentences: 206.835 - 1.015*6 - 84.6*1 = 116.1
    const r = measureText("The cat sat on the mat. ".repeat(6)).readability;
    expect(r?.fleschReadingEase).toBeGreaterThan(113);
    expect(r?.fleschReadingEase).toBeLessThan(119);
  });

  it("returns null readability for short or Hindi text", () => {
    expect(measureText("Short text here.").readability).toBeNull();
    expect(measureText("हमारा घर बहुत सुंदर है। ".repeat(10)).readability).toBeNull();
  });

  it("computes sentence length stats", () => {
    const m = measureText("One two three. One two three four five six.");
    expect(m.sentenceLength).toEqual({ mean: 4.5, median: 4.5, p90: 5.7 });
  });

  it("measures the pronoun mix", () => {
    const p = measureText("We make it. You love our jars. I like them.").pronouns!;
    expect(p.firstPlural).toBeCloseTo(0.333, 2); // we, our
    expect(p.second).toBeCloseTo(0.167, 2); // you
    expect(p.firstSingular).toBeCloseTo(0.167, 2); // i
    expect(p.third).toBeCloseTo(0.333, 2); // it, them
    expect(p.youWeRatio).toBeCloseTo(0.333, 2); // 1 / (1 + 2)
  });

  it("measures emoji, hashtags, exclamations and questions", () => {
    const m = measureText(["Fresh bread today 🍞🍞 #bakery #fresh", "Want some? Come in!"]);
    expect(m.emojiPer100Words).toBeGreaterThan(0);
    expect(m.hashtagsPerText).toBe(1); // 2 hashtags across 2 texts
    expect(m.exclamationPer100Words).toBeGreaterThan(0);
    expect(m.questionShare).toBeCloseTo(1 / 3, 2);
  });

  it("scores concrete copy above abstract copy", () => {
    const concrete = measureText("₹499 for 250 ml jar, ships in 2 days").concreteness;
    const abstract = measureText("We deliver innovative quality solutions with passion").concreteness;
    expect(concrete).toBeGreaterThan(abstract);
  });

  it("does not count bare numbers as concrete", () => {
    const bare = measureText("Plan 1 Plan 2 Plan 3 since 2019 step 4 of 5 innovative solutions").concreteness;
    const unit = measureText("₹499 for 250 ml, ships in 2 days, 5 kg").concreteness;
    expect(bare).toBeLessThan(50);
    expect(unit).toBeGreaterThan(bare);
  });

  it("returns neutral defaults for empty input", () => {
    const m = measureText("   ");
    expect(m.n).toBe(0);
    expect(m.concreteness).toBe(50);
  });
});

describe("logOdds", () => {
  const corpus = {
    software: 50, team: 50, product: 50, customers: 50, build: 50, brand: 2,
  };

  it("ranks a brand-heavy word that is rare in the corpus first", () => {
    const brand = wordCounts("sourdough sourdough sourdough sourdough sourdough sourdough team product");
    const { over } = logOdds(brand, corpus);
    expect(over[0].word).toBe("sourdough");
  });

  it("puts words the brand never uses but the corpus loves in 'under'", () => {
    const brand = wordCounts("sourdough sourdough sourdough team");
    const { under } = logOdds(brand, corpus);
    expect(under.map((i) => i.word)).toContain("software");
  });

  it("gives z near 0 when brand and corpus use a word at the same rate", () => {
    const brand = new Map([["alpha", 50], ["beta", 50]]);
    const { over, under } = logOdds(brand, { alpha: 50, beta: 50 });
    for (const i of [...over, ...under]) expect(Math.abs(i.z)).toBeLessThan(0.5);
  });

  it("returns empty lists without a corpus or brand text", () => {
    expect(logOdds(new Map(), corpus)).toEqual({ over: [], under: [] });
    expect(logOdds(new Map([["a1", 3]]), {})).toEqual({ over: [], under: [] });
  });
});
