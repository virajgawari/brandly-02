import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, findPatterns, learnedBlock, metricValue, normaliseSettings, scoreboard, topFindings, type LearnPost } from "@/lib/agent/stats";

const post = (i: number, over: Partial<LearnPost>): LearnPost => ({ id: `p${i}`, status: "published", ...over });
const many = (n: number, start: number, over: Partial<LearnPost>) => Array.from({ length: n }, (_, i) => post(start + i, over));

describe("metricValue", () => {
  it("treats a thumbs-down as not kept even when scheduled", () => {
    expect(metricValue(post(1, { status: "scheduled", ratings: [-1] }), "kept")).toBe(0);
    expect(metricValue(post(1, { status: "scheduled" }), "kept")).toBe(1);
  });
  it("ignores drafts for kept and posts without metrics for engagement", () => {
    expect(metricValue(post(1, { status: "draft" }), "kept")).toBeUndefined();
    expect(metricValue(post(1, {}), "engagement")).toBeUndefined();
  });
  it("measures edits as the caption change", () => {
    expect(metricValue(post(1, { originalCaption: "a b c d", caption: "a b c d" }), "edits")).toBe(0);
    expect(metricValue(post(1, { originalCaption: "a b c d", caption: "x y z w" }), "edits")).toBe(1);
  });
});

describe("findPatterns", () => {
  it("finds a format the user keeps far more often", () => {
    const posts = [
      ...many(5, 0, { format: "carousel", status: "published" }),
      ...many(5, 10, { format: "quote", status: "discarded" }),
      ...many(2, 20, { format: "quote", status: "published" }),
    ];
    const f = findPatterns(posts).find((x) => x.value === "carousel" && x.metric === "kept");
    expect(f?.direction).toBe("more");
    expect(f?.n).toBe(5);
    expect(f?.evidencePostIds).toHaveLength(5);
    expect(f?.statement).toMatch(/keep and schedule/);
    const q = findPatterns(posts).find((x) => x.value === "quote" && x.metric === "kept");
    expect(q?.direction).toBe("less");
  });

  it("stays silent below the minimum sample", () => {
    const posts = [...many(3, 0, { format: "carousel", status: "published" }), ...many(8, 10, { format: "quote", status: "discarded" })];
    expect(findPatterns(posts).filter((f) => f.value === "carousel")).toHaveLength(0);
  });

  it("stays silent when groups perform alike", () => {
    const posts = [...many(6, 0, { format: "a", engagement: 0.05 }), ...many(6, 10, { format: "b", engagement: 0.052 })];
    expect(findPatterns(posts).filter((f) => f.metric === "engagement")).toHaveLength(0);
  });

  it("finds engagement winners and reads edits in the right direction", () => {
    const posts = [
      ...many(5, 0, { hook: "question", engagement: 0.09, originalCaption: "a b c d e f", caption: "a b c d e f" }),
      ...many(5, 10, { hook: "stat", engagement: 0.03, originalCaption: "a b c d e f", caption: "u v w x y z" }),
    ];
    const found = findPatterns(posts);
    expect(found.find((f) => f.value === "question" && f.metric === "engagement")?.direction).toBe("more");
    // "stat" is rewritten but its baseline is 0, so only the mirror finding (question: barely edited) is reported.
    expect(found.find((f) => f.value === "question" && f.metric === "edits")?.direction).toBe("more");
    expect(found.find((f) => f.value === "stat" && f.metric === "edits")).toBeUndefined();
  });

  it("respects configured thresholds", () => {
    const posts = [...many(3, 0, { format: "a", status: "published" }), ...many(3, 10, { format: "b", status: "discarded" })];
    expect(findPatterns(posts)).toHaveLength(0);
    expect(findPatterns(posts, { ...DEFAULT_SETTINGS, minSample: 3 }).length).toBeGreaterThan(0);
  });
});

describe("topFindings / learnedBlock / normaliseSettings", () => {
  it("keeps one finding per dimension+value", () => {
    const posts = [
      ...many(5, 0, { format: "a", engagement: 0.1, status: "published" }),
      ...many(5, 10, { format: "b", engagement: 0.02, status: "discarded" }),
    ];
    const top = topFindings(findPatterns(posts));
    expect(new Set(top.map((f) => `${f.dimension}:${f.value}`)).size).toBe(top.length);
  });
  it("renders nothing without accepted insights", () => {
    expect(learnedBlock([])).toBe("");
    expect(learnedBlock([{ statement: "Use carousels." }])).toContain("- Use carousels.");
  });
  it("clamps bad settings", () => {
    expect(normaliseSettings({ minSample: -4, minLift: 99, windowDays: Number.NaN })).toEqual({ ...DEFAULT_SETTINGS, minSample: 2, minLift: 3 });
  });
});

describe("scoreboard", () => {
  const mk = (i: number, fit: number, engagement?: number): LearnPost => ({ id: `p${i}`, status: "published", fit, engagement });
  it("needs enough posts with both fit and engagement", () => {
    const s = scoreboard([mk(1, 80, 0.05), mk(2, 60), mk(3, 70)]);
    expect(s.verdict).toBe("not-enough");
    expect(s.scored).toBe(1);
    expect(s.awaitingMetrics).toBe(2);
  });
  it("says up when higher fit gets more engagement", () => {
    const s = scoreboard([50, 55, 60, 70, 80, 90].map((f, i) => mk(i, f, f / 1000)));
    expect(s.verdict).toBe("up");
    expect(s.highFit!).toBeGreaterThan(s.lowFit!);
  });
  it("says down when it is inverted", () => {
    const s = scoreboard([50, 55, 60, 70, 80, 90].map((f, i) => mk(i, f, (100 - f) / 1000)));
    expect(s.verdict).toBe("down");
  });
});
