import { describe, expect, it } from "vitest";
import { buildIdeasPrompt, cleanIdeas, IdeasSchema, IDEA_COUNT } from "@/lib/content/ideas";
import type { BrandModel } from "@/lib/brand/model";

const model = {
  name: "Blue Tokai",
  strategy: { industry: "food_beverage", offering: "specialty coffee", audience: { ageGroups: ["25-34"], markets: { countries: ["India"], cityTiers: [] }, motivations: [] }, differentiators: ["single-origin", "roasted fresh"] },
  content: { pillars: ["Origin stories", "Brew guides"] },
} as unknown as BrandModel;

describe("ideas schema", () => {
  it("accepts known templates and rejects unknown ones", () => {
    expect(IdeasSchema.safeParse({ ideas: [{ title: "Meet the farm", pitch: "A look at where the beans grow.", template: "behind_scenes" }] }).success).toBe(true);
    expect(IdeasSchema.safeParse({ ideas: [{ title: "Meet the farm", pitch: "A look at where the beans grow.", template: "nope" }] }).success).toBe(false);
  });
});

describe("buildIdeasPrompt", () => {
  it("includes the brand facts and recent posts", () => {
    const p = buildIdeasPrompt(model, ["Monsoon is here"]);
    expect(p).toContain("Blue Tokai");
    expect(p).toContain("specialty coffee");
    expect(p).toContain("25-34");
    expect(p).toContain("Origin stories; Brew guides");
    expect(p).toContain("1. Monsoon is here");
  });
  it("omits the recent block when there is no history", () => {
    expect(buildIdeasPrompt(model)).not.toContain("Recent posts");
  });
});

describe("cleanIdeas", () => {
  it("drops duplicate titles and caps the count", () => {
    const mk = (title: string) => ({ title, pitch: "Something to say.", template: "engagement" });
    const out = cleanIdeas([mk("A post"), mk("a post"), mk("B post"), mk("C post"), mk("D post"), mk("E post")]);
    expect(out.map((i) => i.title)).toEqual(["A post", "B post", "C post", "D post"]);
    expect(out.length).toBe(IDEA_COUNT);
  });
});
