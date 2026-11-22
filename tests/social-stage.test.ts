import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const analyse = vi.fn();
const structured = vi.fn();
vi.mock("@/lib/llm", () => ({
  analyseImages: (...a: unknown[]) => analyse(...a),
  generateStructured: (...a: unknown[]) => structured(...a),
  parseJSON: (t: string) => {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  },
}));

import { socialStage } from "@/lib/brand/stages/social";
import { emptyModel } from "@/lib/brand/model";
import { mergePatch } from "@/lib/brand/merge";
import { toPromptContext } from "@/lib/brand/projection";
import { imagePromptFromBrief } from "@/lib/content/visual";
import type { ScoredPost } from "@/lib/social/types";

const post = (i: number, top = false): ScoredPost => ({
  externalId: `p${i}`,
  timestamp: "2026-10-01T00:00:00Z",
  type: "image",
  caption: `caption ${i}`,
  hashtags: [],
  mentions: [],
  likes: 10 - i,
  comments: 1,
  views: 0,
  mediaUrls: ["u"],
  engagementScore: 10 - i,
  isTop: top,
});

const style = {
  medium: "soft sunlit lifestyle",
  palette: "cream and sage",
  composition: "centred",
  typography: "",
  promptSuffix: "Soft warm window light, 35mm film grain, muted cream and sage palette.",
};
const playbook = {
  pillars: [{ name: "how-to", pct: 60 }, { name: "product", pct: 40 }],
  adjectives: ["warm", "plain"],
  neverSoundsLike: "a salesman",
  hookFormulas: ["a question"],
  formatting: { avgWords: 40, lineBreaks: "short paragraphs", emoji: "none" },
  cta: "soft ask",
  hashtagRule: "3 at the end",
  blacklist: ["elevate"],
};

const run = (input: Parameters<typeof socialStage.run>[1]) =>
  socialStage.run(emptyModel("Acme", "analyse", "b1"), input, { report: () => {} });

beforeEach(() => {
  analyse.mockReset();
  structured.mockReset();
});

describe("social stage", () => {
  it("skips with fewer than 3 posts and makes no LLM calls", async () => {
    const r = await run({ socialPosts: [post(1), post(2)] });
    expect(r.patches).toEqual([]);
    expect(analyse).not.toHaveBeenCalled();
    expect(structured).not.toHaveBeenCalled();
  });

  it("writes a style guide and a playbook with the top captions as anchors", async () => {
    analyse.mockResolvedValue(JSON.stringify(style));
    structured.mockResolvedValue(playbook);
    const r = await run({ socialPosts: [post(1, true), post(2, true), post(3)], socialImages: ["b64"] });
    expect(analyse).toHaveBeenCalledTimes(1);
    expect(structured).toHaveBeenCalledTimes(1);
    const merged = r.patches.reduce(
      (m, p) => mergePatch(m, p.patch, p.options).model,
      emptyModel("Acme", "analyse", "b1"),
    );
    expect(merged.expression.styleGuide?.promptSuffix).toContain("35mm");
    expect(merged.voice.playbook?.anchors).toEqual(["caption 1", "caption 2"]);
    expect(merged.voice.vocabulary.avoid).toContain("elevate");
  });

  it("keeps the learned lettering fields and patches the render font", async () => {
    analyse.mockResolvedValue(JSON.stringify({ ...style, textColor: "#FFFFFF", fontPairId: "fraunces-inter", textBox: "pill", peoplePct: 40, peopleStyle: "candid" }));
    structured.mockResolvedValue(playbook);
    const r = await run({ socialPosts: [post(1, true), post(2), post(3)], socialImages: ["b64"] });
    const merged = r.patches.reduce((m, p) => mergePatch(m, p.patch, p.options).model, emptyModel("Acme", "analyse", "b1"));
    const g = merged.expression.styleGuide;
    expect(g?.textColor).toBe("#FFFFFF");
    expect(g?.textBox).toBe("pill");
    expect(g?.peoplePct).toBe(40);
    expect(merged.expression.tokens.font.heading.$value).toBe("Fraunces");
  });

  it("drops an unknown fontPairId without touching the font", async () => {
    analyse.mockResolvedValue(JSON.stringify({ ...style, fontPairId: "comic-sans" }));
    structured.mockResolvedValue(playbook);
    const base = emptyModel("Acme", "analyse", "b1");
    const r = await run({ socialPosts: [post(1, true), post(2), post(3)], socialImages: ["b64"] });
    const merged = r.patches.reduce((m, p) => mergePatch(m, p.patch, p.options).model, base);
    expect(merged.expression.styleGuide?.fontPairId).toBeUndefined();
    expect(merged.expression.tokens.font.heading.$value).toBe(base.expression.tokens.font.heading.$value);
  });

  it("still writes the playbook when the vision call fails", async () => {
    analyse.mockRejectedValue(new Error("busy"));
    structured.mockResolvedValue(playbook);
    const r = await run({ socialPosts: [post(1, true), post(2), post(3)], socialImages: ["b64"] });
    expect(r.patches).toHaveLength(1);
  });
});

describe("generation inputs", () => {
  it("builds the image prompt from the style guide suffix", () => {
    const m = emptyModel("Acme", "analyse", "b1");
    m.expression.styleGuide = style;
    const prompt = imagePromptFromBrief({ subject: "a ceramic cup", setting: "stone table", lighting: "morning light", composition: "overhead", usesProductPhoto: false }, m);
    expect(prompt).toContain("soft sunlit lifestyle");
    expect(prompt).toContain("a ceramic cup, stone table");
    expect(prompt).toContain("35mm film grain");
    expect(prompt).toContain("No text");
  });

  it("adds no people clause to a product-photo brief", () => {
    const m = emptyModel("Acme", "analyse", "b1");
    m.expression.styleGuide = { ...style, peoplePct: 100, peopleStyle: "candid" };
    const brief = { subject: "a ceramic cup", setting: "stone table", lighting: "morning light", composition: "overhead" };
    expect(imagePromptFromBrief({ ...brief, usesProductPhoto: false }, m, undefined, "", () => 0)).toContain("Include a person");
    expect(imagePromptFromBrief({ ...brief, usesProductPhoto: true }, m, undefined, "", () => 0)).not.toContain("Include a person");
  });

  it("puts the playbook into the prompt context", () => {
    const m = emptyModel("Acme", "analyse", "b1");
    m.voice.playbook = { ...playbook, anchors: [] };
    const ctx = toPromptContext(m);
    expect(ctx).toContain("PILLAR SPLIT: how-to 60%, product 40%");
    expect(ctx).toContain("NEVER WRITE: elevate");
  });
});
