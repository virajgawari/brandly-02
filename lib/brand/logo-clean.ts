// Turns a logo drawn on a plain white background into a transparent, trimmed PNG.

/** Alpha for a pixel: opaque when clearly not white, transparent when near white, soft in between. */
export function whiteToAlpha(r: number, g: number, b: number): number {
  const lo = 235; // at or above: fully transparent
  const hi = 170; // at or below: fully opaque
  const m = Math.min(r, g, b);
  if (m >= lo) return 0;
  if (m <= hi) return 255;
  return Math.round(((lo - m) / (lo - hi)) * 255);
}

/** JPEG/PNG bytes on white → trimmed PNG with transparency, at most 1024 px on a side. */
export async function cleanLogo(input: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) data[i + 3] = Math.min(data[i + 3], whiteToAlpha(data[i], data[i + 1], data[i + 2]));
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return sharp(png)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
    .extend({ top: 48, bottom: 48, left: 48, right: 48, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}
