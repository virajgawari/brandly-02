import { describe, expect, it } from "vitest";
import { groundingIssues, stripUnverified, unverifiedProducts } from "@/lib/judge/grounding";

const FACTS = `Brand: Blue Tokai. Fresh specialty coffee, roasted in India. Promise: Coffee roasted within days, not months.
Products: Freshly roasted coffee beans, cold brew and cafes. Sample line: "Roasted on Monday. At your door by Thursday."
Pillars: Farm stories, Brew guides, New roasts, Cafe life.`;

describe("groundingIssues", () => {
  it("flags an invented offer (percentage, code, shipping, hours)", () => {
    const issues = groundingIssues(
      {
        caption: "Sip fresh, feel alive. Grab a 15% discount on any first order and get it in 48 hours. Use code NEWBREEZE at checkout.",
        headline: "First Order 15% Off",
        subline: "Use code NEWBREEZE, free shipping, 48-hour delivery",
      },
      FACTS
    );
    expect(issues.join(" ")).toMatch(/15%/);
    expect(issues.join(" ")).toMatch(/NEWBREEZE/);
    expect(issues.join(" ")).toMatch(/48/);
    expect(issues.join(" ").toLowerCase()).toMatch(/free shipping/);
  });

  it("flags an invented person and estate", () => {
    const issues = groundingIssues(
      { caption: "If you’re looking for beans that feel fresh, meet Ravi at Savanur Estate. He picks each pod by hand. We roast them within days." },
      FACTS
    );
    expect(issues).toEqual(expect.arrayContaining(["Ravi", "Savanur"]));
  });

  it("flags an invented origin and guarantee", () => {
    const issues = groundingIssues({ caption: "Our new Ethiopian beans from the Bale Mountains. Freshness guaranteed." }, FACTS);
    expect(issues.join(" ")).toMatch(/Ethiopian/);
    expect(issues.join(" ")).toMatch(/Bale/);
    expect(issues.join(" ").toLowerCase()).toMatch(/guaranteed/);
  });

  it("passes a post that only uses what it was given", () => {
    const issues = groundingIssues(
      {
        caption: "Your morning cup should taste like this week, not last quarter. We roast within days, in India. Roasted on Monday, at your door by Thursday.",
        headline: "Roasted within days",
        cta: "Try a fresh bag today.",
        stat: "",
      },
      FACTS
    );
    expect(issues).toEqual([]);
  });

  it("allows small counts, years, hashtags and sentence-start words", () => {
    const issues = groundingIssues(
      { caption: "3 steps to a better pour-over. Pour slowly. Then wait. See you in 2026! #BlueTokai #PourOver", headline: "Better pour-over in 3 steps" },
      FACTS
    );
    expect(issues).toEqual([]);
  });

  it("takes numbers and names from the request", () => {
    const facts = `${FACTS}\nRequest: 20% off this weekend with code WEEKEND20 from Priya at the Indiranagar cafe`;
    const issues = groundingIssues({ caption: "Get 20% off this weekend. Use code WEEKEND20. Ask for Priya at the Indiranagar cafe." }, facts);
    expect(issues).toEqual([]);
  });

  it("flags an invented customer quote but allows one that is in the facts", () => {
    const bad = groundingIssues({ caption: "A regular told us, “It's the first time I've felt coffee so effortless.”" }, FACTS);
    expect(bad.some((i) => i.startsWith("quote"))).toBe(true);
    const ok = groundingIssues({ caption: "Roasted on Monday. At your door by Thursday." }, FACTS);
    expect(ok).toEqual([]);
    const sample = groundingIssues({ caption: 'Our line: "Roasted on Monday. At your door by Thursday."' }, FACTS);
    expect(sample).toEqual([]);
  });
});

describe("unverifiedProducts", () => {
  const catalog = ["Pegasus 41", "Vomero"];
  it("flags an invented model name", () => {
    expect(unverifiedProducts(["Meet the Nike Air Zoom Dawn today"], "Nike", catalog)).toEqual(["Nike Air Zoom Dawn"]);
  });
  it("passes verified products, brand-only and category copy", () => {
    expect(unverifiedProducts(["The Nike Pegasus 41 is here", "Nike Vomero for easy miles", "Nike running shoes", "Nike"], "Nike", catalog)).toEqual([]);
  });
  it("strips leftovers to the brand name", () => {
    expect(stripUnverified("Try the Nike Air Zoom Dawn now", ["Nike Air Zoom Dawn"], "Nike")).toBe("Try the Nike now");
  });
});
