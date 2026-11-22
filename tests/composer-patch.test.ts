import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { cleanInstruction, diffDrafts, mergePatch, newFailures, type PatchDraft } from "@/lib/content/patch";

const draft: PatchDraft = {
  headline: "Fresh roast, daily",
  supportingLine: "Small batch coffee",
  caption: "Our beans are roasted every morning in small batches.",
  hashtags: ["#coffee", "#roast", "#morning", "#smallbatch", "#beans"],
  cta: "Shop now",
  layoutId: "text-bold" as never,
};
const o = { platform: "instagram" as const, facts: "Our beans are roasted every morning in small batches. Fresh roast, daily Small batch coffee Shop now" };

describe("composer patch guard", () => {
  it("accepts a clean style edit", () => {
    const merged = mergePatch(draft, { headline: "Roasted fresh today", changeSummary: "" });
    expect(newFailures(draft, merged, o)).toEqual([]);
    expect(Object.keys(diffDrafts(draft, merged))).toEqual(["headline"]);
  });
  it("rejects banned words that a prompt tries to slip in", () => {
    const merged = mergePatch(draft, { caption: "Elevate your mornings with our game-changer roast, a true testament to craft.", changeSummary: "" });
    expect(newFailures(draft, merged, o).join(" ")).toMatch(/banned/);
  });
  it("rejects invented facts even if the instruction asked for them", () => {
    const merged = mergePatch(draft, { caption: "Our beans are roasted every morning. Now 40% off until 31 March!", changeSummary: "" });
    expect(newFailures(draft, merged, o).length).toBeGreaterThan(0);
  });
  it("enforces the hashtag count", () => {
    const merged = mergePatch(draft, { hashtags: ["coffee", "roast"], changeSummary: "" });
    expect(newFailures(draft, merged, o).join(" ")).toMatch(/hashtags/);
  });
  it("enforces the platform character limit", () => {
    const merged = mergePatch(draft, { caption: "Our beans are roasted every morning. ".repeat(12), changeSummary: "" });
    expect(newFailures(draft, merged, { ...o, platform: "twitter" }).join(" ")).toMatch(/over limit/);
  });
  it("ignores unknown layout ids and cleans the instruction", () => {
    expect(mergePatch(draft, { layoutId: "../../evil", changeSummary: "" }).layoutId).toBe(draft.layoutId);
    expect(cleanInstruction("a\n\nb" + "x".repeat(400)).length).toBe(300);
  });
});
