import type { BrandModel, Personality, Tone } from "./model";
import type { Platform } from "@/lib/types";

// Personality and tone are stored 0–100. Older code (and the colour maths) thinks in
// personality 0–1 and tone -1..1, so convert at the edge with these helpers.

export const clampPct = (v: number) => Math.max(0, Math.min(100, v));
export const round = (v: number) => Math.round(v);

/** 0–1 → 0–100. */
export const unitToPct = (v: number) => clampPct(round(v * 100));
/** 0–100 → 0–1. */
export const pctToUnit = (v: number) => clampPct(v) / 100;

/** Signed tone -1..1 → 0–100 (-1 → 0, 0 → 50, 1 → 100). */
export const signedToTone = (v: number) => clampPct(round((v + 1) * 50));
/** 0–100 → -1..1. */
export const toneToSigned = (v: number) => clampPct(v) / 50 - 1;

export const personalityToUnit = (p: Personality): Personality =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, pctToUnit(v)])) as unknown as Personality;

export const TONE_KEYS = ["funny_serious", "formal_casual", "respectful_irreverent", "enthusiastic_matter"] as const;

/** The tone to write in, with the platform's overrides applied over the brand's base tone. */
export function effectiveTone(model: Pick<BrandModel, "voice">, platform?: Platform): Tone {
  const over = platform ? model.voice.toneByPlatform?.[platform] : undefined;
  return { ...model.voice.tone, ...(over ?? {}) };
}

/** LLM replies may still use the old ranges. A 0–100 reply never has every value within -1..1 (or 0..1). */
export const looksLikeSignedTone = (t: Record<string, number>) => TONE_KEYS.every((k) => typeof t[k] === "number" && t[k] >= -1 && t[k] <= 1);
export const looksLikeUnitPersonality = (p: Record<string, number>) => Object.values(p).every((v) => typeof v === "number" && v >= 0 && v <= 1);
