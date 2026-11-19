import { describe, expect, it } from "vitest";
import { SCENES, SCENE_TEXT_MAX, scenePrompt } from "@/lib/render/scenes";

describe("scenePrompt", () => {
  it("leaves the prompt alone with no scene or text", () => {
    expect(scenePrompt("A latte on a table")).toBe("A latte on a table");
    expect(scenePrompt("A latte on a table", "nope", "  ")).toBe("A latte on a table");
  });
  it("prefixes a preset and keeps the post's idea", () => {
    const out = scenePrompt("A latte on a table", "flatlay")!;
    expect(out.startsWith(SCENES.find((s) => s.id === "flatlay")!.prefix)).toBe(true);
    expect(out).toContain("A latte on a table");
  });
  it("free text replaces the post's idea", () => {
    const out = scenePrompt("A latte on a table", "golden", "Beans spilling from a sack")!;
    expect(out).toContain("Beans spilling from a sack");
    expect(out).not.toContain("latte");
  });
  it("caps free text and works with no base prompt", () => {
    const out = scenePrompt(undefined, undefined, "x".repeat(500))!;
    expect(out.length).toBe(SCENE_TEXT_MAX);
  });
});
