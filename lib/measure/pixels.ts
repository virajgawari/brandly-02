import { dedupeColors, hexToRgb, isNearGray, isNearWhiteOrBlack, rgbToHex } from "../brand/color";

/** One colour found in an image and the share of visible pixels it covers (0–1). */
export interface Cluster {
  hex: string;
  share: number;
}

/** Bump when the clustering or filtering changes, so stored palettes can be recomputed. */
export const PIXELS_VERSION = "pixels-1";

type Lab = [number, number, number];

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** sRGB (0–255) to CIE Lab (D65). Distances in Lab track how different two colours look. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const dist2 = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Small seeded generator, so the same image always gives the same palette. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface KmeansOptions {
  k?: number;
  seed?: number;
  iterations?: number;
}

/**
 * k-means over raw pixels (interleaved RGB or RGBA bytes). Clusters in Lab, reports each cluster's mean RGB.
 * Pixels that are mostly transparent are ignored. Result is sorted by share, largest first.
 */
export function kmeans(data: ArrayLike<number>, channels: 3 | 4, { k = 5, seed = 1, iterations = 20 }: KmeansOptions = {}): Cluster[] {
  const rgb: [number, number, number][] = [];
  const lab: Lab[] = [];
  for (let i = 0; i + channels <= data.length; i += channels) {
    if (channels === 4 && data[i + 3] < 128) continue;
    rgb.push([data[i], data[i + 1], data[i + 2]]);
    lab.push(rgbToLab(data[i], data[i + 1], data[i + 2]));
  }
  const n = lab.length;
  if (!n) return [];
  const rand = mulberry32(seed);

  // k-means++ start: each new centre is picked in proportion to its squared distance from the nearest one.
  const centres: Lab[] = [lab[Math.floor(rand() * n)]];
  const nearest = new Float64Array(n).fill(Infinity);
  while (centres.length < Math.min(k, n)) {
    const last = centres[centres.length - 1];
    let total = 0;
    for (let i = 0; i < n; i++) {
      nearest[i] = Math.min(nearest[i], dist2(lab[i], last));
      total += nearest[i];
    }
    if (total === 0) break; // every remaining pixel is already a centre
    let pick = rand() * total;
    let idx = 0;
    for (; idx < n - 1; idx++) {
      pick -= nearest[idx];
      if (pick <= 0) break;
    }
    centres.push(lab[idx]);
  }

  const assign = new Int32Array(n);
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centres.length; c++) {
        const d = dist2(lab[i], centres[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        moved = true;
      }
    }
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const s = sums[assign[i]];
      s[0] += lab[i][0];
      s[1] += lab[i][1];
      s[2] += lab[i][2];
      s[3]++;
    }
    sums.forEach((s, c) => {
      if (s[3]) centres[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    });
    if (!moved && it > 0) break;
  }

  const acc = centres.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < n; i++) {
    const a = acc[assign[i]];
    a[0] += rgb[i][0];
    a[1] += rgb[i][1];
    a[2] += rgb[i][2];
    a[3]++;
  }
  return acc
    .filter((a) => a[3] > 0)
    .map((a) => ({ hex: rgbToHex(a[0] / a[3], a[1] / a[3], a[2] / a[3]), share: a[3] / n }))
    .sort((x, y) => y.share - x.share);
}

/**
 * Brand-like colours out of a logo's clusters: no white, black or grey, and nothing that covers
 * a sliver of the logo. Most-used first.
 */
export function brandColours(clusters: Cluster[], minShare = 0.03): string[] {
  const kept = clusters.filter((c) => c.share >= minShare && !isNearGray(c.hex) && !isNearWhiteOrBlack(c.hex));
  return dedupeColors(kept.sort((a, b) => b.share - a.share).map((c) => c.hex));
}

/** Merges the palettes of several images, weighting by share, into at most `max` colours. */
export function poolPalettes(palettes: Cluster[][], max = 6, minDistance = 28): Cluster[] {
  const merged: { rgb: [number, number, number]; share: number }[] = [];
  const all = palettes.flat().sort((a, b) => b.share - a.share);
  for (const c of all) {
    const rgb = hexToRgb(c.hex);
    const hit = merged.find((m) => Math.hypot(m.rgb[0] - rgb[0], m.rgb[1] - rgb[1], m.rgb[2] - rgb[2]) < minDistance);
    if (hit) {
      const total = hit.share + c.share;
      hit.rgb = [0, 1, 2].map((i) => (hit.rgb[i] * hit.share + rgb[i] * c.share) / total) as [number, number, number];
      hit.share = total;
    } else merged.push({ rgb, share: c.share });
  }
  const total = merged.reduce((s, m) => s + m.share, 0) || 1;
  return merged
    .sort((a, b) => b.share - a.share)
    .slice(0, max)
    .map((m) => ({ hex: rgbToHex(...m.rgb), share: m.share / total }));
}
