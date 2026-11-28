import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { cleanLogo, whiteToAlpha } from "@/lib/brand/logo-clean";

describe("whiteToAlpha", () => {
  it("makes white transparent and dark opaque", () => {
    expect(whiteToAlpha(255, 255, 255)).toBe(0);
    expect(whiteToAlpha(20, 30, 40)).toBe(255);
    const mid = whiteToAlpha(200, 200, 200);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(255);
  });
});

describe("cleanLogo", () => {
  it("removes the white background and trims to the mark", async () => {
    const mark = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#1a2b3c" } }).png().toBuffer();
    const src = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#ffffff" } })
      .composite([{ input: mark, left: 150, top: 150 }])
      .jpeg()
      .toBuffer();
    const out = await cleanLogo(src);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(info.width).toBeLessThan(400);
    expect(data[3]).toBe(0); // corner is padding: transparent
    const mid = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4;
    expect(data[mid + 3]).toBe(255); // centre is the mark
  });
});
