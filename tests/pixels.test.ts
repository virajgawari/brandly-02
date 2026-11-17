import { describe, expect, it } from "vitest";
import { brandColours, kmeans, poolPalettes } from "../lib/measure/pixels";
import { hexToRgb } from "../lib/brand/color";

const colorDistance = (a: string, b: string) => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

/** Interleaved RGBA bytes: `count` pixels of each colour. */
const image = (parts: [number[], number][]) =>
  Uint8Array.from(parts.flatMap(([rgba, count]) => Array.from({ length: count }, () => rgba).flat()));

const RED = [208, 46, 46, 255];
const BLUE = [20, 60, 200, 255];

describe("kmeans", () => {
  it("finds two flat colours and their shares", () => {
    const out = kmeans(image([[RED, 300], [BLUE, 100]]), 4, { k: 2 });
    expect(out).toHaveLength(2);
    expect(out[0].share).toBeCloseTo(0.75, 2);
    expect(colorDistance(out[0].hex, "#D02E2E")).toBeLessThan(3);
    expect(colorDistance(out[1].hex, "#143CC8")).toBeLessThan(3);
  });

  it("gives the same palette for the same seed", () => {
    const img = image([[RED, 120], [BLUE, 80], [[240, 200, 20, 255], 60]]);
    expect(kmeans(img, 4, { k: 3, seed: 7 })).toEqual(kmeans(img, 4, { k: 3, seed: 7 }));
  });

  it("ignores transparent pixels", () => {
    const out = kmeans(image([[RED, 100], [[0, 255, 0, 0], 900]]), 4, { k: 3 });
    expect(out).toHaveLength(1);
    expect(colorDistance(out[0].hex, "#D02E2E")).toBeLessThan(3);
  });

  it("returns nothing for an empty or fully transparent image", () => {
    expect(kmeans(new Uint8Array(), 4)).toEqual([]);
    expect(kmeans(image([[[1, 2, 3, 0], 50]]), 4)).toEqual([]);
  });

  it("works on RGB without alpha and with fewer colours than k", () => {
    const out = kmeans(Uint8Array.from([...RED.slice(0, 3), ...RED.slice(0, 3)]), 3, { k: 5 });
    expect(out).toHaveLength(1);
    expect(out[0].share).toBe(1);
  });
});

describe("brandColours", () => {
  it("drops white, black, grey and slivers, keeps the rest by share", () => {
    const out = brandColours([
      { hex: "#FFFFFF", share: 0.5 },
      { hex: "#D02E2E", share: 0.25 },
      { hex: "#808080", share: 0.1 },
      { hex: "#000000", share: 0.08 },
      { hex: "#143CC8", share: 0.05 },
      { hex: "#FFD20F", share: 0.02 },
    ]);
    expect(out).toEqual(["#D02E2E", "#143CC8"]);
  });

  it("merges near-identical colours", () => {
    expect(brandColours([{ hex: "#D02E2E", share: 0.3 }, { hex: "#D13030", share: 0.2 }])).toEqual(["#D02E2E"]);
  });
});

describe("poolPalettes", () => {
  it("merges the same colour across images and orders by combined share", () => {
    const out = poolPalettes([
      [{ hex: "#D02E2E", share: 0.6 }, { hex: "#143CC8", share: 0.4 }],
      [{ hex: "#D12F2F", share: 0.3 }, { hex: "#FFD20F", share: 0.7 }],
    ]);
    expect(out).toHaveLength(3);
    expect(out[0].share).toBeCloseTo(0.45, 2);
    expect(colorDistance(out[0].hex, "#D02E2E")).toBeLessThan(5);
    expect(out.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 5);
  });

  it("caps the palette size", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ hex: `#${(i * 25).toString(16).padStart(2, "0")}8040`, share: 0.1 }));
    expect(poolPalettes([many], 4)).toHaveLength(4);
  });
});
