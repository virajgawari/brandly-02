// Deterministic layout QA run before rasterisation: WCAG contrast, text fitting, logo white-box detection.
// Pure functions (no server imports) so they are unit-testable.
import { contrastRatio, hexToHsl, hslToHex, readableOn } from "@/lib/brand/color";

/** WCAG 2.1: 4.5:1 for body/CTA text, 3:1 for display text (headlines of 24px and up). */
export const BODY_MIN = 4.5;
export const DISPLAY_MIN = 3;
export const SCRIM = "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55) 100%)";

export type TextRole = "display" | "body";
export const minContrast = (role: TextRole, sizePx = 0) => (role === "display" && sizePx >= 24 ? DISPLAY_MIN : BODY_MIN);

export interface ContrastFix {
  color: string;
  ratio: number;
  /** True when the input colour was changed. */
  adjusted: boolean;
  /** Present when the text sits on a photo: lay this gradient over the photo behind the text. */
  scrim?: string;
}

/**
 * Returns a text colour that clears the WCAG threshold on `bg`. Steps the colour's HSL lightness away from the
 * background until it passes (keeping hue); falls back to black/white if the hue cannot get there.
 * With `overPhoto` the background is unknown, so it returns a legible colour plus a scrim.
 */
export function enforceContrast(fg: string, bg: string, o: { role?: TextRole; sizePx?: number; overPhoto?: boolean } = {}): ContrastFix {
  if (o.overPhoto) {
    const bgGuess = "#1A1A1A"; // the scrim darkens the lower part of the photo
    const color = contrastRatio(fg, bgGuess) >= BODY_MIN ? fg : "#FFFFFF";
    return { color, ratio: contrastRatio(color, bgGuess), adjusted: color !== fg, scrim: SCRIM };
  }
  const need = minContrast(o.role ?? "body", o.sizePx);
  const start = contrastRatio(fg, bg);
  if (start >= need) return { color: fg, ratio: start, adjusted: false };
  const hsl = hexToHsl(fg);
  const lighten = contrastRatio("#FFFFFF", bg) >= contrastRatio("#000000", bg);
  for (let l = hsl.l; lighten ? l <= 1 : l >= 0; l += lighten ? 0.02 : -0.02) {
    const c = hslToHex({ ...hsl, l: Math.min(1, Math.max(0, l)) });
    const r = contrastRatio(c, bg);
    if (r >= need) return { color: c, ratio: r, adjusted: true };
  }
  const color = readableOn(bg);
  return { color, ratio: contrastRatio(color, bg), adjusted: true };
}

export interface FitResult {
  px: number;
  lines: number;
  /** Text was cut with an ellipsis because even minPx did not fit. */
  truncated: boolean;
  text: string;
}

/** Rough glyph width in em for bold display fonts; capitals are wider. */
const charEm = (ch: string) => (ch === " " ? 0.28 : /[A-Z0-9]/.test(ch) ? 0.68 : /[iljtfI.,:;'!|]/.test(ch) ? 0.3 : /[mwMW@]/.test(ch) ? 0.85 : 0.54);

export function wrapLines(text: string, px: number, boxW: number): number {
  let lines = 1;
  let x = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = [...word].reduce((s, c) => s + charEm(c) * px, 0);
    const space = 0.28 * px;
    if (x > 0 && x + space + w > boxW) {
      lines++;
      x = 0;
    }
    // A single word wider than the box breaks across lines.
    if (w > boxW) lines += Math.ceil(w / boxW) - 1;
    x += (x > 0 ? space : 0) + Math.min(w, boxW);
  }
  return lines;
}

/** Largest font size in [minPx, maxPx] at which `text` wraps to a height within boxH; truncates only as a last resort. */
export function fitTextToBox(text: string, o: { boxW: number; boxH: number; minPx: number; maxPx: number; lineHeight?: number }): FitResult {
  const lh = o.lineHeight ?? 1.1;
  const fits = (t: string, px: number) => wrapLines(t, px, o.boxW) * px * lh <= o.boxH;
  for (let px = Math.round(o.maxPx); px >= o.minPx; px -= 2) {
    if (fits(text, px)) return { px, lines: wrapLines(text, px, o.boxW), truncated: false, text };
  }
  const px = Math.round(o.minPx);
  let t = text;
  while (t.length > 1 && !fits(t + "…", px)) t = t.slice(0, -1).replace(/\s+\S*$/, "") || t.slice(0, -1);
  return { px, lines: wrapLines(t + "…", px, o.boxW), truncated: true, text: t.trimEnd() + "…" };
}

/**
 * True when a logo's raster is an opaque near-white rectangle (every border pixel opaque and near-white),
 * which looks like a pasted white box on any non-white card. `data` is raw RGBA.
 */
export function hasOpaqueWhiteBox(data: Uint8Array | Buffer, width: number, height: number): boolean {
  if (width < 2 || height < 2) return false;
  const bad = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return !(data[i + 3] >= 250 && data[i] >= 240 && data[i + 1] >= 240 && data[i + 2] >= 240);
  };
  for (let x = 0; x < width; x++) if (bad(x, 0) || bad(x, height - 1)) return false;
  for (let y = 0; y < height; y++) if (bad(0, y) || bad(width - 1, y)) return false;
  return true;
}

/** A logo with a white box needs a pill when the card isn't itself white. */
export const logoNeedsBadge = (boxed: boolean | undefined, cardBg: string) => !!boxed && contrastRatio(cardBg, "#FFFFFF") > 1.15;
