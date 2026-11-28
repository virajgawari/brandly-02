import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/brand/color";
import { enforceContrast, fitTextToBox, hasOpaqueWhiteBox, SCRIM } from "@/lib/render/layout-qa";

describe("enforceContrast", () => {
  it("fixes pastel-on-white body text to 4.5:1", () => {
    const r = enforceContrast("#F7C6D9", "#FFFFFF", { role: "body" });
    expect(r.adjusted).toBe(true);
    expect(contrastRatio(r.color, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
  it("only needs 3:1 for display text of 24px+", () => {
    const r = enforceContrast("#E08A3C", "#FFFFFF", { role: "display", sizePx: 80 });
    expect(contrastRatio(r.color, "#FFFFFF")).toBeGreaterThanOrEqual(3);
  });
  it("leaves passing colours alone", () => {
    expect(enforceContrast("#111111", "#FFFFFF").adjusted).toBe(false);
  });
  it("lightens text on dark surfaces", () => {
    const r = enforceContrast("#223355", "#111111");
    expect(contrastRatio(r.color, "#111111")).toBeGreaterThanOrEqual(4.5);
  });
  it("adds the scrim over photos", () => {
    const r = enforceContrast("#F7C6D9", "#000000", { overPhoto: true });
    expect(r.scrim).toBe(SCRIM);
  });
});

describe("fitTextToBox", () => {
  const box = { boxW: 912, boxH: 420, minPx: 40, maxPx: 104 };
  it("keeps short headlines at max size", () => expect(fitTextToBox("Fresh drops", box).px).toBe(104));
  it("steps a 90-character headline down so it fits without truncating", () => {
    const text = "Our new small-batch roasted single origin coffee beans are finally back in stock for you.".padEnd(90, "!").slice(0, 90);
    const r = fitTextToBox(text, box);
    expect(text.length).toBe(90);
    expect(r.px).toBeLessThan(104);
    expect(r.truncated).toBe(false);
    expect(r.lines * r.px * 1.1).toBeLessThanOrEqual(420);
  });
  it("truncates with an ellipsis only when minPx still overflows", () => {
    const r = fitTextToBox("word ".repeat(200), box);
    expect(r.truncated).toBe(true);
    expect(r.text.endsWith("…")).toBe(true);
  });
});

describe("hasOpaqueWhiteBox", () => {
  const img = (fill: (x: number, y: number) => number[]) => {
    const d = new Uint8Array(8 * 8 * 4);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) d.set(fill(x, y), (y * 8 + x) * 4);
    return d;
  };
  it("flags a logo on an opaque white rectangle", () => expect(hasOpaqueWhiteBox(img((x, y) => (x === 4 && y === 4 ? [200, 0, 0, 255] : [255, 255, 255, 255])), 8, 8)).toBe(true));
  it("passes a transparent-background logo", () => expect(hasOpaqueWhiteBox(img((x, y) => (x === 4 && y === 4 ? [200, 0, 0, 255] : [0, 0, 0, 0])), 8, 8)).toBe(false));
});
