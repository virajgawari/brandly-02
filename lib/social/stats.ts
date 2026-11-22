import type { ScoredPost } from "./types";

/** Facts counted straight from the brand's scraped posts (no model involved). */
export interface PostStats {
  sampleSize: number;
  /** Caption length in words. */
  words: { p25: number; median: number; p75: number };
  /** Emoji per post (median) and share of posts that use any. */
  emoji: { median: number; usedPct: number };
  /** Share of captions that contain a blank line / line break. */
  lineBreakPct: number;
  hashtags: { median: number; top: string[] };
  /** Share of posts that @mention someone. */
  mentionPct: number;
  /** Best posting slots, weighted by engagement. Hours are 0-23 in the given time zone, days 0 = Sunday. */
  bestDays: number[];
  bestHours: number[];
  /** Average engagement score per post type. */
  engagementByType: Partial<Record<"image" | "carousel" | "video" | "text", number>>;
  /** Average engagement score for short / medium / long captions (terciles of word count). */
  engagementByLength: { short: number; medium: number; long: number };
  /** Which caption length bucket performs best. */
  bestLength: "short" | "medium" | "long";
}

const EMOJI = /\p{Extended_Pictographic}/gu;

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)) * 10) / 10;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : 0);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function slot(ts: string, timeZone: string): { day: number; hour: number } | null {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
    return day < 0 || Number.isNaN(hour) ? null : { day, hour };
  } catch {
    return { day: d.getUTCDay(), hour: d.getUTCHours() };
  }
}

/** Top keys by total weight, at most `n`, ignoring slots that only appear once when there is more data. */
function topSlots(weights: Map<number, { w: number; n: number }>, n: number): number[] {
  return Array.from(weights.entries())
    .sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n)
    .slice(0, n)
    .map(([k]) => k);
}

/** Counts caption, hashtag, timing and engagement habits from the scored posts. Returns undefined with fewer than 5 posts. */
export function computePostStats(posts: ScoredPost[], timeZone = "UTC"): PostStats | undefined {
  if (posts.length < 5) return undefined;
  const wordsOf = (p: ScoredPost) => p.caption.trim().split(/\s+/).filter(Boolean).length;
  const words = posts.map(wordsOf).sort((a, b) => a - b);
  const emojiCounts = posts.map((p) => (p.caption.match(EMOJI) ?? []).length).sort((a, b) => a - b);

  const tagFreq = new Map<string, number>();
  for (const p of posts) for (const t of new Set(p.hashtags.map((h) => h.toLowerCase().replace(/^#/, "")))) if (t) tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
  const top = Array.from(tagFreq.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => `#${t}`);

  const days = new Map<number, { w: number; n: number }>();
  const hours = new Map<number, { w: number; n: number }>();
  for (const p of posts) {
    const s = slot(p.timestamp, timeZone);
    if (!s) continue;
    for (const [m, k] of [[days, s.day], [hours, s.hour]] as const) {
      const e = m.get(k) ?? { w: 0, n: 0 };
      e.w += p.engagementScore;
      e.n += 1;
      m.set(k, e);
    }
  }

  const byType: PostStats["engagementByType"] = {};
  for (const t of ["image", "carousel", "video", "text"] as const) {
    const xs = posts.filter((p) => p.type === t).map((p) => p.engagementScore);
    if (xs.length >= 2) byType[t] = avg(xs);
  }

  const q1 = quantile(words, 1 / 3);
  const q2 = quantile(words, 2 / 3);
  const bucket = (p: ScoredPost) => (wordsOf(p) <= q1 ? "short" : wordsOf(p) <= q2 ? "medium" : "long");
  const lenAvg = {
    short: avg(posts.filter((p) => bucket(p) === "short").map((p) => p.engagementScore)),
    medium: avg(posts.filter((p) => bucket(p) === "medium").map((p) => p.engagementScore)),
    long: avg(posts.filter((p) => bucket(p) === "long").map((p) => p.engagementScore)),
  };
  const bestLength = (Object.keys(lenAvg) as (keyof typeof lenAvg)[]).sort((a, b) => lenAvg[b] - lenAvg[a])[0];

  return {
    sampleSize: posts.length,
    words: { p25: quantile(words, 0.25), median: quantile(words, 0.5), p75: quantile(words, 0.75) },
    emoji: { median: quantile(emojiCounts, 0.5), usedPct: pct(emojiCounts.filter((c) => c > 0).length, posts.length) },
    lineBreakPct: pct(posts.filter((p) => /\n\s*\n|\n/.test(p.caption.trim())).length, posts.length),
    hashtags: { median: quantile(posts.map((p) => p.hashtags.length).sort((a, b) => a - b), 0.5), top },
    mentionPct: pct(posts.filter((p) => p.mentions.length > 0).length, posts.length),
    bestDays: topSlots(days, 2),
    bestHours: topSlots(hours, 3),
    engagementByType: byType,
    engagementByLength: lenAvg,
    bestLength,
  };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Tue, Thu 7-9pm" style label for the best slots, or "" when unknown. */
export function bestTimeLabel(s?: PostStats): string {
  if (!s || !s.bestDays.length || !s.bestHours.length) return "";
  const fmt = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
  const hs = [...s.bestHours].sort((a, b) => a - b);
  return `${s.bestDays.map((d) => DAY_NAMES[d]).join(", ")} ${fmt(hs[0])}${hs.length > 1 ? `-${fmt(hs[hs.length - 1])}` : ""}`;
}
