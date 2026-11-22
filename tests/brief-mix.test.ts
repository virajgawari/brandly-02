import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { EMPTY_HISTORY } from "@/lib/content/history";
import { FORMATS, HOOKS, learnedHooks, pickBrief } from "@/lib/content/brief";
import type { BrandModel } from "@/lib/brand/model";

const base = {
  name: "Cafe",
  strategy: { industry: "food_beverage", offering: "coffee", proofPoints: ["roasted fresh"], differentiators: ["single-origin"], audience: { moments: [] } },
  content: { pillars: ["Origin", "Brew"], productsServices: ["beans"], categoryEntryPoints: [] },
  voice: { sampleLines: [] },
};
const playbook = (extra: object = {}) => ({ pillars: [], adjectives: [], neverSoundsLike: "", hookFormulas: [], formatting: { avgWords: 20, lineBreaks: "", emoji: "" }, cta: "", hashtagRule: "", blacklist: [], anchors: [], ...extra });
const modelWith = (pb?: object) => ({ ...base, voice: { sampleLines: [], playbook: pb } }) as unknown as BrandModel;

// A deterministic generator, so a run of picks is repeatable.
function seeded(seed = 7) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

describe("pickBrief follows the feed's format mix", () => {
  const target = FORMATS.filter((f) => !f.manual && !f.requires)[0].id;

  it("picks the dominant format far more often than chance", () => {
    const m = modelWith(playbook({ formatMix: [{ format: target, pct: 90 }] }));
    const rand = seeded();
    let hits = 0;
    for (let i = 0; i < 60; i++) if (pickBrief(m, EMPTY_HISTORY, undefined, { rand }).format.id === target) hits++;
    expect(hits).toBeGreaterThan(20);
  });

  it("still works with no playbook", () => {
    const b = pickBrief(modelWith(), EMPTY_HISTORY, undefined, { rand: seeded() });
    expect(b.format.id).toBeTruthy();
    expect(HOOKS.map((h) => h.id)).toContain(b.hook.id);
  });

  it("never carousels when the feed has none", () => {
    const m = modelWith(playbook({ postTypeMix: { image: 100, carousel: 0, video: 0 } }));
    const rand = seeded();
    for (let i = 0; i < 40; i++) expect(pickBrief(m, EMPTY_HISTORY, undefined, { allowCarousel: true, rand }).carousel).toBe(false);
  });
});

describe("learnedHooks", () => {
  it("uses the brand's own openers and falls back to the generic list", () => {
    expect(learnedHooks(modelWith(playbook({ hookFormulas: ["Starts with a one-word question"] })))[0].instruction).toContain("one-word question");
    expect(learnedHooks(modelWith())).toBe(HOOKS);
  });
});
