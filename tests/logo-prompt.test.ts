import { describe, expect, it } from "vitest";
import { emptyModel } from "@/lib/brand/model";
import { buildLogoPrompt, LOGO_VARIANTS } from "@/lib/brand/logo-prompt";

const model = () => {
  const m = emptyModel("Blue Tokai", "analyse", "00000000-0000-4000-8000-000000000009");
  m.strategy.industry = "food_beverage";
  return m;
};

describe("buildLogoPrompt", () => {
  it("forbids text and never includes the brand name", () => {
    const p = buildLogoPrompt(model(), 0);
    expect(p).toContain("No text");
    expect(p).not.toContain("Blue Tokai");
    expect(p).toContain("food & beverage");
  });
  it("gives each variant a different concept", () => {
    const m = model();
    const set = new Set(Array.from({ length: LOGO_VARIANTS }, (_, i) => buildLogoPrompt(m, i)));
    expect(set.size).toBe(LOGO_VARIANTS);
  });
  it("uses brand colours when valid hex, else a generic line", () => {
    const m = model();
    m.expression.tokens.color.primary.$value = "#112233";
    expect(buildLogoPrompt(m, 0)).toContain("#112233");
    m.expression.tokens.color.primary.$value = "red";
    m.expression.tokens.color.accent.$value = "";
    expect(buildLogoPrompt(m, 0)).toContain("one or two flat colours");
  });
  it("reflects personality in the mood", () => {
    const m = model();
    m.personality.sophistication = 90;
    expect(buildLogoPrompt(m, 0)).toContain("refined, premium");
  });
  it("wraps variant numbers", () => {
    expect(buildLogoPrompt(model(), LOGO_VARIANTS)).toBe(buildLogoPrompt(model(), 0));
  });
});
