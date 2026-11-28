/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
// Shared pieces for Satori layouts. Satori only supports flexbox: every element
// with more than one child needs display: flex.
import type { CSSProperties, ReactNode } from "react";
import type { LayoutId, LayoutKit } from "@/lib/brand/model";
import { contrastRatio, readableOn } from "@/lib/brand/color";
import { enforceContrast, fitTextToBox } from "../layout-qa";

export interface LayoutColors {
  primary: string;
  secondary: string;
  accent: string;
  neutral: string;
}

export interface LayoutProps {
  kit: LayoutKit;
  colors: LayoutColors;
  /** Font family names registered with the renderer. */
  fonts: { heading: string; body: string };
  brandName: string;
  /** Data URI of the logo (PNG/JPEG/SVG), if usable. */
  logo?: string;
  /** Average tone of the logo's visible pixels, to keep it visible on the background. */
  logoTone?: "light" | "dark";
  /** The logo is an opaque white rectangle: it gets a clean pill on non-white cards. */
  logoBoxed?: boolean;
  /** Data URI of the photo, if the layout uses one. */
  photo?: string;
  /** Product carousel cover: the product photos shown in the collage. */
  photos?: string[];
  /** Carousel slide without the step number (the product carousel's closing slide). */
  noNumber?: boolean;
  /** Brand's learned on-image text colour (#hex) from its real posts. Applied only where it stays readable. */
  textColor?: string;
  /** Learned background behind on-image text over photos. */
  textBox?: "none" | "pill" | "box";
  headline: string;
  subline?: string;
  /** Content pillar, shown as a small kicker above the headline. */
  kicker?: string;
  /** Mean brightness (0-255) of the photo's lower 40%, measured server-side; drives the scrim strength. */
  photoLuma?: number;
  cta?: string;
  items?: string[];
  stat?: string;
  width: number;
  height: number;
  /** Carousel position, 1-based. */
  slide?: { index: number; total: number };
}

export type Layout = (p: LayoutProps) => ReactNode;
export type LayoutRegistry = Record<LayoutId, Layout>;

export const PAD = 84;

export function applyCase(text: string, c: LayoutKit["headlineCase"]): string {
  if (c === "upper") return text.toUpperCase();
  if (c === "title") return text.replace(/\b([a-z])([a-z']*)/g, (_, a: string, b: string) => a.toUpperCase() + b);
  return text;
}

/** Headline size that keeps long lines inside the frame. */
export function headlineSize(text: string, width: number, max = 104): number {
  const n = text.length * (text === text.toUpperCase() ? 1.18 : 1);
  const base = n <= 18 ? max : n <= 32 ? max * 0.84 : n <= 50 ? max * 0.7 : n <= 72 ? max * 0.58 : max * 0.48;
  return Math.round((base * width) / 1080);
}

const isLight = (hex: string) => contrastRatio(hex, "#000000") > contrastRatio(hex, "#FFFFFF");

/**
 * The brand's learned text colour in place of the layout's default, but only when it
 * sits on the same side (light or dark) and keeps strong contrast, so a learned colour
 * never makes a post unreadable. `bg` is the real background when the layout knows it.
 */
export function pickText(p: LayoutProps, color: string, bg?: string): string {
  const t = p.textColor;
  if (!t || !color.startsWith("#")) return color;
  if (isLight(t) !== isLight(color)) return color;
  const against = bg ?? (isLight(color) ? "#000000" : "#FFFFFF");
  return contrastRatio(t, against) >= (bg ? 4.5 : 7) ? t : color;
}

/** Pill or box behind text that sits over a photo. Undefined when the brand puts text straight on the photo. */
export function textBoxStyle(p: LayoutProps): CSSProperties | undefined {
  if (!p.textBox || p.textBox === "none") return undefined;
  // Over a photo the layout's text is light, so the box is always a dark one.
  return {
    display: "flex",
    flexDirection: "column",
    alignSelf: "flex-start",
    background: "rgba(0,0,0,0.62)",
    padding: p.textBox === "pill" ? "26px 46px" : "36px 44px",
    borderRadius: p.textBox === "pill" ? 56 : Math.min(p.kit.radius, 24),
  };
}

/** Background, text and accent colours for text-led layouts. */
export function scheme(p: LayoutProps) {
  const bg = p.colors[p.kit.background];
  const fg = pickText(p, readableOn(bg), bg);
  // Accent must stand out on the background; fall back through the palette.
  const candidates = [p.colors.accent, p.colors.primary, p.colors.secondary, p.colors.neutral].filter((c) => c !== bg);
  // Accent is used for big display text (stat, quote mark): WCAG 3:1, stepping its lightness if no palette colour clears it.
  const accent = candidates.find((c) => contrastRatio(c, bg) >= 3) ?? enforceContrast(candidates[0] ?? fg, bg, { role: "display", sizePx: 48 }).color;
  const muted = fg === "#FFFFFF" ? "rgba(255,255,255,0.78)" : "rgba(17,17,17,0.72)";
  return { bg, fg, accent, muted, onAccent: readableOn(accent) };
}

/** Space to keep clear at the top/bottom edge for the corner logo. */
export function logoSpace(p: LayoutProps, edge: "top" | "bottom"): number {
  return p.kit.logoPosition.startsWith(edge) ? 120 : 0;
}

/** Vertical padding that leaves room for the corner logo. */
export function edgePad(p: LayoutProps, base: number = PAD): CSSProperties {
  return { paddingTop: base + logoSpace(p, "top"), paddingBottom: base + logoSpace(p, "bottom") };
}

export function Logo({ p, color, size = 64, style }: { p: LayoutProps; color: string; size?: number; style?: CSSProperties }) {
  if (p.logo) {
    // A light logo on a light background (or dark on dark) gets a contrasting chip.
    const bgIsLight = color !== "#FFFFFF";
    const needsChip = p.logoTone ? (p.logoTone === "light") === bgIsLight : false;
    const img = <img src={p.logo} height={size} style={{ height: size, maxWidth: size * 4, objectFit: "contain" }} />;
    // An opaque white logo box on a coloured card: seat it in a deliberate pill instead of a stray rectangle.
    if (p.logoBoxed) {
      return (
        <div style={{ display: "flex", padding: `${Math.round(size * 0.16)}px ${Math.round(size * 0.28)}px`, borderRadius: 999, background: "#FFFFFF", ...style }}>
          {img}
        </div>
      );
    }
    if (!needsChip) return <div style={{ display: "flex", ...style }}>{img}</div>;
    return (
      <div style={{ display: "flex", padding: Math.round(size * 0.18), borderRadius: Math.min(p.kit.radius, size / 3), background: bgIsLight ? "#1A1A1A" : "#FFFFFF", ...style }}>
        {img}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", fontFamily: p.fonts.heading, fontWeight: 700, fontSize: Math.round(size * 0.62), color, letterSpacing: 0.5, ...style }}>
      {p.brandName}
    </div>
  );
}

/** Logo pinned to the kit's corner. */
export function CornerLogo({ p, color, size = 76 }: { p: LayoutProps; color: string; size?: number }) {
  const pos = p.kit.logoPosition;
  const style: CSSProperties = {
    position: "absolute",
    display: "flex",
    ...(pos.startsWith("top") ? { top: PAD * 0.7 } : { bottom: PAD * 0.7 }),
    ...(pos.endsWith("left") ? { left: PAD } : { right: PAD }),
  };
  return (
    <div style={style}>
      <Logo p={p} color={color} size={size} />
    </div>
  );
}

/** The kit's accent shape, drawn behind or beside the headline. */
export function AccentMark({ p, color }: { p: LayoutProps; color: string }) {
  const s = p.kit.accentShape;
  if (s === "none") return null;
  if (s === "bar") return <div style={{ display: "flex", width: 120, height: 14, background: color, borderRadius: Math.min(p.kit.radius, 7), marginBottom: 36 }} />;
  if (s === "underline") return <div style={{ display: "flex", width: 72, height: 4, background: color, marginBottom: 40 }} />;
  if (s === "circle") return <div style={{ display: "flex", width: 56, height: 56, background: color, borderRadius: 28, marginBottom: 36 }} />;
  // corner
  return <div style={{ display: "flex", width: 64, height: 64, borderTop: `10px solid ${color}`, borderLeft: `10px solid ${color}`, marginBottom: 32 }} />;
}

/** Splits "Make *every* post count" into words, flagging the ones wrapped in asterisks. */
export function parseEmphasis(text: string): { plain: string; words: { w: string; em: boolean }[] } {
  const words: { w: string; em: boolean }[] = [];
  let em = false;
  for (const part of text.split(/(\*)/)) {
    if (part === "*") {
      em = !em;
      continue;
    }
    for (const w of part.split(/\s+/).filter(Boolean)) words.push({ w, em });
  }
  return { plain: words.map((x) => x.w).join(" "), words };
}

export function Headline({ p, color, size, style, accent }: { p: LayoutProps; color: string; size?: number; style?: CSSProperties; accent?: string }) {
  const parsed = parseEmphasis(p.headline);
  const text = applyCase(parsed.plain, p.kit.headlineCase);
  // Capitals are wider: shrink explicit sizes too.
  const want = size ? Math.round(size * (p.kit.headlineCase === "upper" ? 0.86 : 1)) : headlineSize(text, p.width);
  // Never clip: step the size down until the wrapped headline fits its slot.
  const fit = fitTextToBox(text, { boxW: p.width - PAD * 2, boxH: p.height * 0.4, minPx: Math.round(want * 0.5), maxPx: want, lineHeight: 1.02 });
  const fs = fit.px;
  const base: CSSProperties = {
    display: "flex",
    fontFamily: p.fonts.heading,
    fontWeight: 800,
    fontSize: fs,
    lineHeight: 1.02,
    letterSpacing: p.kit.headlineCase === "upper" ? 1 : -1.5,
    color: pickText(p, color),
    ...style,
  };
  // Emphasis only when the fitted text kept every word (no ellipsis) and an accent was given.
  const hasEm = !!accent && parsed.words.some((x) => x.em) && fit.text === text;
  if (!hasEm) return <div style={base}>{fit.text}</div>;
  const words = fit.text.split(/\s+/);
  return (
    <div style={{ ...base, flexWrap: "wrap" }}>
      {words.map((w, i) => (
        <span key={i} style={{ display: "flex", marginRight: Math.round(fs * 0.24), color: parsed.words[i]?.em ? accent : undefined }}>
          {w}
        </span>
      ))}
    </div>
  );
}

/** Small uppercase label above the headline (the content pillar). */
export function Kicker({ p, color }: { p: LayoutProps; color: string }) {
  if (!p.kicker) return null;
  return (
    <div style={{ display: "flex", fontFamily: p.fonts.body, fontWeight: 600, fontSize: 20, letterSpacing: 3.5, textTransform: "uppercase", color, marginBottom: 22 }}>
      {p.kicker.slice(0, 32)}
    </div>
  );
}

const rgbOf = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  return [parseInt(f.slice(0, 2), 16) || 0, parseInt(f.slice(2, 4), 16) || 0, parseInt(f.slice(4, 6), 16) || 0];
};

/** Strength of the bottom scrim from the photo's measured brightness: bright photos need more help. */
export function scrimAlpha(luma?: number): number {
  if (luma === undefined) return 0.72;
  if (luma > 140) return 0.88;
  if (luma < 75) return 0.58;
  return 0.58 + ((luma - 75) / (140 - 75)) * 0.3;
}

/** Four-stop gradient over the photo's lower part, tinted with a very dark shade of the brand colour. */
export function Scrim({ p, from = 38 }: { p: LayoutProps; from?: number }) {
  const [r, g, b] = rgbOf(p.colors.primary).map((c) => Math.round(c * 0.18));
  const a = scrimAlpha(p.photoLuma);
  const c = (x: number) => `rgba(${r},${g},${b},${x.toFixed(2)})`;
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        top: 0,
        left: 0,
        width: p.width,
        height: p.height,
        backgroundImage: `linear-gradient(180deg, ${c(0)} ${from}%, ${c(a * 0.35)} ${from + (100 - from) * 0.4}%, ${c(a * 0.72)} ${from + (100 - from) * 0.72}%, ${c(a)} 100%)`,
      }}
    />
  );
}

export function Subline({ p, color, size = 38, style }: { p: LayoutProps; color: string; size?: number; style?: CSSProperties }) {
  if (!p.subline) return null;
  return <div style={{ display: "flex", fontFamily: p.fonts.body, fontSize: size, lineHeight: 1.35, color, marginTop: 28, ...style }}>{p.subline}</div>;
}

export function Cta({ p, bg, fg }: { p: LayoutProps; bg: string; fg: string }) {
  if (!p.cta) return null;
  const text = p.cta.length > 42 ? p.cta.slice(0, 40).replace(/\s+\S*$/, "") + "…" : p.cta;
  return (
    <div
      style={{
        display: "flex",
        alignSelf: "flex-start",
        padding: "14px 26px",
        background: bg,
        color: fg,
        borderRadius: Math.min(p.kit.radius * 2, 40),
        fontFamily: p.fonts.body,
        fontWeight: 700,
        fontSize: 26,
        marginTop: 36,
      }}
    >
      {text}
    </div>
  );
}

export function Frame({ bg, children, style }: { bg: string; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", background: bg, ...style }}>{children}</div>;
}

/** Photo filling the whole frame, uncropped when it has the frame's aspect, with a dark fade at the bottom for text. */
export function FullBleedPhoto({ p }: { p: LayoutProps }) {
  return (
    <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: p.width, height: p.height }}>
      <Photo p={p} style={{ width: p.width, height: p.height }} />
      <div
        style={{ display: "flex", position: "absolute", top: 0, left: 0, width: p.width, height: p.height }}
      >
        <Scrim p={p} from={30} />
      </div>
    </div>
  );
}

export function Photo({ p, style }: { p: LayoutProps; style?: CSSProperties }) {
  if (!p.photo) return <div style={{ display: "flex", background: p.colors.secondary, ...style }} />;
  return <img src={p.photo} style={{ objectFit: "cover", ...style }} />;
}
