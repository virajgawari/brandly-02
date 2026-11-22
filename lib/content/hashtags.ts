import type { BrandModel } from "@/lib/brand/model";

export interface HashtagRange {
  min: number;
  max: number;
}

export const DEFAULT_HASHTAGS: HashtagRange = { min: 5, max: 10 };

const WORD_NUMBERS: Record<string, number> = { no: 0, none: 0, zero: 0, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * Reads the playbook's free-text hashtag rule ("1 hashtag at the end", "3-5 tags", "none")
 * into a count range. Falls back to 5-10 when the rule is empty or has no number.
 */
export function parseHashtagRule(rule?: string): HashtagRange {
  const t = (rule ?? "").toLowerCase().trim();
  if (!t) return DEFAULT_HASHTAGS;
  if (/\b(no|zero|without|avoid)\b[^.]*\bhashtags?\b|\bnone\b/.test(t) && !/\d/.test(t)) return { min: 0, max: 0 };
  const range = t.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const n = t.match(/(\d+)/) ?? t.match(new RegExp(`\\b(${Object.keys(WORD_NUMBERS).join("|")})\\b`));
  if (!n) return DEFAULT_HASHTAGS;
  const v = /^\d+$/.test(n[1]) ? Number(n[1]) : WORD_NUMBERS[n[1]];
  if (/\b(up to|max(?:imum)?|at most|no more than)\b/.test(t)) return { min: Math.min(1, v), max: v };
  return { min: v, max: v };
}

export function hashtagRange(model?: BrandModel): HashtagRange {
  return parseHashtagRule(model?.voice.playbook?.hashtagRule);
}

export function rangeText(r: HashtagRange): string {
  if (r.max === 0) return "none";
  return r.min === r.max ? `exactly ${r.max}` : `${r.min}-${r.max}`;
}
