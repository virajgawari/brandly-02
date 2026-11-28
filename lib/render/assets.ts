import "server-only";
import { hasOpaqueWhiteBox } from "./layout-qa";
import { safeFetch } from "@/lib/net/safe-fetch";
import { hexToRgb } from "@/lib/brand/color";
import type { Db } from "@/lib/db/session";

// Satori decodes PNG, JPEG and SVG only, so everything else (WebP, AVIF, GIF) goes
// through sharp. sharp ships with Next.js; if it is missing, those images are skipped.
type Sharp = typeof import("sharp").default;
let sharpMod: Sharp | null | undefined;
async function getSharp(): Promise<Sharp | null> {
  if (sharpMod !== undefined) return sharpMod;
  try {
    sharpMod = (await import("sharp")).default;
  } catch {
    sharpMod = null;
  }
  return sharpMod;
}

const MAX_BYTES = 12_000_000;

async function fetchBytes(url: string): Promise<{ buf: Buffer; type: string } | null> {
  if (url.startsWith("data:")) {
    const m = url.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
    if (!m) return null;
    return { buf: m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3])), type: m[1] ?? "" };
  }
  const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : "";
  const target = new URL(url);
  const init = { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandlyBot/1.0)" } };
  const res = target.host === supabaseHost ? await fetch(target, init) : await safeFetch(url, init);
  if (!res.ok) return null;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) return null;
  return { buf, type: res.headers.get("content-type")?.split(";")[0] ?? "" };
}

const toDataUri = (buf: Buffer, type: string) => `data:${type};base64,${buf.toString("base64")}`;

export interface ImageOptions {
  /** Longest side after resizing. */
  maxSide?: number;
  /** Tint a greyscale copy with this colour (duotone treatment). */
  duotone?: string;
  /** Keep transparency (logos). */
  keepAlpha?: boolean;
  /** Enlarge small photos to maxSide with lanczos3 and a light sharpen (generated or low-res images). */
  upscale?: boolean;
}

/** Turns image bytes into a data URI Satori can draw. Returns undefined for unusable images. */
export async function toRenderable(input: { buf: Buffer; type: string }, opts: ImageOptions = {}): Promise<string | undefined> {
  const { buf, type } = input;
  const isSvg = type.includes("svg") || buf.subarray(0, 200).toString("utf8").includes("<svg");
  const sharp = await getSharp();
  if (!sharp) {
    if (isSvg) return toDataUri(buf, "image/svg+xml");
    if (/png|jpe?g/.test(type) && !opts.duotone) return toDataUri(buf, type);
    return undefined;
  }
  try {
    let img = sharp(buf, { density: isSvg ? 300 : undefined, animated: false }).rotate();
    const max = opts.maxSide ?? 1600;
    img = img.resize({ width: max, height: max, fit: "inside", withoutEnlargement: !isSvg && !opts.upscale, kernel: "lanczos3" });
    if (opts.upscale && !isSvg) img = img.sharpen({ sigma: 0.6 });
    if (opts.duotone) {
      const [r, g, b] = hexToRgb(opts.duotone);
      img = img.grayscale().tint({ r, g, b });
    }
    if (opts.keepAlpha) return toDataUri(await img.png().toBuffer(), "image/png");
    return toDataUri(await img.flatten({ background: "#ffffff" }).jpeg({ quality: 86 }).toBuffer(), "image/jpeg");
  } catch {
    return undefined; // ICO and other formats sharp can't read
  }
}

export async function imageFromUrl(url: string | undefined, opts: ImageOptions = {}): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const bytes = await fetchBytes(url);
    return bytes ? toRenderable(bytes, opts) : undefined;
  } catch (err) {
    console.warn("[render] image fetch failed", url.slice(0, 120), err instanceof Error ? err.message : err);
    return undefined;
  }
}

export async function imageFromStorage(db: Db, bucket: string, path: string | undefined, opts: ImageOptions = {}): Promise<string | undefined> {
  if (!path) return undefined;
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) {
    console.warn("[render] storage download failed", bucket, path, error?.message);
    return undefined;
  }
  return toRenderable({ buf: Buffer.from(await data.arrayBuffer()), type: data.type }, opts);
}

/** Raw bytes of a remote image, re-encoded as JPEG for storage (brand photos). */
export async function downloadAsJpeg(url: string, maxSide = 1600): Promise<{ buf: Buffer; width?: number; height?: number } | null> {
  try {
    const bytes = await fetchBytes(url);
    if (!bytes) return null;
    const sharp = await getSharp();
    if (!sharp) return /jpe?g/.test(bytes.type) ? { buf: bytes.buf } : null;
    const img = sharp(bytes.buf, { animated: false }).rotate();
    const meta = await img.metadata();
    const out = await img.resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
    return { buf: out, width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

export interface ImagePixels {
  data: Uint8Array;
  channels: 3 | 4;
  /** 512px JPEG for the vision call, so each photo is downloaded once. */
  jpeg512?: Buffer;
}

/** Downsampled raw pixels (RGBA, transparency kept) plus a small JPEG. SVG logos are rasterised at 300 dpi. */
export async function imagePixels(url: string, side = 64): Promise<ImagePixels | null> {
  try {
    const bytes = await fetchBytes(url);
    const sharp = await getSharp();
    if (!bytes || !sharp) return null;
    const isSvg = bytes.type.includes("svg") || bytes.buf.subarray(0, 200).toString("utf8").includes("<svg");
    const base = () => sharp(bytes.buf, { density: isSvg ? 300 : undefined, animated: false }).rotate();
    const { data } = await base().resize(side, side, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const jpeg512 = await base()
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: !isSvg })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { data: new Uint8Array(data), channels: 4, jpeg512 };
  } catch {
    return null;
  }
}

/** True when the logo is an opaque white rectangle (no real transparency). */
export async function logoHasWhiteBox(dataUri: string | undefined): Promise<boolean> {
  if (!dataUri?.startsWith("data:")) return false;
  const sharp = await getSharp();
  if (!sharp) return false;
  try {
    const buf = Buffer.from(dataUri.split(",")[1], "base64");
    const { data, info } = await sharp(buf).resize(96, 96, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return hasOpaqueWhiteBox(data, info.width, info.height);
  } catch {
    return false;
  }
}

/** Average tone of an image's visible (non-transparent) pixels. */
export async function imageTone(dataUri: string | undefined): Promise<"light" | "dark" | undefined> {
  if (!dataUri?.startsWith("data:")) return undefined;
  const sharp = await getSharp();
  if (!sharp) return undefined;
  try {
    const buf = Buffer.from(dataUri.split(",")[1], "base64");
    const { data, info } = await sharp(buf).resize(64, 64, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const a = data[i + 3] / 255;
      if (a < 0.1) continue;
      sum += ((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255) * a;
      weight += a;
    }
    return weight ? (sum / weight > 0.6 ? "light" : "dark") : undefined;
  } catch {
    return undefined;
  }
}

/** Mean brightness (0-255) of the bottom 40% of an image, where headlines usually sit. undefined when it can't be measured. */
export async function bottomLuminance(dataUri: string | undefined): Promise<number | undefined> {
  if (!dataUri) return undefined;
  const sharp = await getSharp();
  if (!sharp) return undefined;
  try {
    const buf = Buffer.from(dataUri.split(",")[1] ?? "", "base64");
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return undefined;
    const top = Math.floor(meta.height * 0.6);
    const { channels } = await sharp(buf).extract({ left: 0, top, width: meta.width, height: meta.height - top }).removeAlpha().toColourspace("srgb").stats();
    const [r, g, b] = channels.map((c) => c.mean);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  } catch {
    return undefined;
  }
}
