// How closely a post matches the brand's real Instagram feed. Pure and free (no LLM, no server imports),
// so the composer can recompute it live as the caption is edited.
import type { Playbook } from "@/lib/brand/model";
import { parseHashtagRule, type HashtagRange } from "@/lib/content/hashtags";

export interface FeedPart {
  id: "length" | "emoji" | "shape" | "hashtags" | "format" | "closing" | "words";
  label: string;
  /** 0-100. */
  score: number;
  /** One plain sentence: what the post does vs what the feed does. */
  detail: string;
}

export interface FeedCheck {
  status: "ok" | "unavailable";
  /** 0-100, mean of the parts. */
  score: number;
  parts: FeedPart[];
}

export interface FeedPostInput {
  caption: string;
  hashtags?: string[];
  cta?: string;
  format?: string;
}

/** Feed match at or above this reads as "fits"; below FEED_WARN it reads as "off". */
export const FEED_PASS = 75;
export const FEED_WARN = 55;

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const wordsOf = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Emoji count the feed uses per post, read from the playbook's free text. Undefined when it can't be read. */
export function emojiRange(text: string): { min: number; max: number } | undefined {
  const t = text.toLowerCase();
  if (!t.trim()) return undefined;
  if (/\b(no|none|never|zero|without)\b[^.]*emoji|no emojis?|^none/.test(t) && !/\d/.test(t)) return { min: 0, max: 0 };
  const range = t.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/);
  if (range) return { min: Math.min(+range[1], +range[2]), max: Math.max(+range[1], +range[2]) };
  const one = t.match(/(\d+)/);
  if (one) return { min: Math.max(0, +one[1] - 1), max: +one[1] + 1 };
  if (/\b(rare|rarely|sparing|minimal|few|occasional|light)\b/.test(t)) return { min: 0, max: 2 };
  if (/\b(heavy|lots|many|frequent|abundant|liberal|plenty)\b/.test(t)) return { min: 3, max: 12 };
  return undefined;
}

/** Whether the feed breaks its captions into short separate lines (true), keeps blocks (false), or can't tell. */
export function wantsLineBreaks(text: string): boolean | undefined {
  const t = text.toLowerCase();
  if (!t.trim()) return undefined;
  if (/\b(single block|one block|no line breaks?|one paragraph|continuous|dense)\b/.test(t)) return false;
  if (/(line[- ]?breaks?|spaced|paragraph|short lines?|one[- ]liners?|bullets?|separate|stacked)/.test(t)) return true;
  return undefined;
}

function distanceScore(value: number, lo: number, hi: number, perStep: number): number {
  const d = value < lo ? lo - value : value > hi ? value - hi : 0;
  return clamp(100 - d * perStep);
}

export function scoreFeedMatch(post: FeedPostInput, playbook: Playbook | undefined, tags?: HashtagRange): FeedCheck {
  if (!playbook) return { status: "unavailable", score: 0, parts: [] };
  const caption = post.caption ?? "";
  const parts: FeedPart[] = [];

  const avg = playbook.formatting?.avgWords ?? 0;
  if (avg > 0) {
    const w = wordsOf(caption);
    const off = Math.abs(w - avg) / avg;
    parts.push({ id: "length", label: "Length", score: clamp(100 - off * 110), detail: `${w} words; the feed averages ${avg}.` });
  }

  const emoji = emojiRange(playbook.formatting?.emoji ?? "");
  if (emoji) {
    const n = (caption.match(EMOJI_RE) ?? []).length;
    parts.push({ id: "emoji", label: "Emoji", score: distanceScore(n, emoji.min, emoji.max, 25), detail: `${n} emoji; the feed uses ${playbook.formatting.emoji.trim().slice(0, 80)}.` });
  }

  const breaks = wantsLineBreaks(playbook.formatting?.lineBreaks ?? "");
  if (breaks !== undefined) {
    const blocks = caption.split(/\n/).filter((l) => l.trim()).length;
    const has = blocks >= 2;
    parts.push({ id: "shape", label: "Line breaks", score: has === breaks ? 100 : 45, detail: `${has ? "Broken into lines" : "One block"}; the feed ${breaks ? "breaks its captions into short lines" : "writes in blocks"}.` });
  }

  const range = tags ?? parseHashtagRule(playbook.hashtagRule);
  if (playbook.hashtagRule?.trim()) {
    const n = post.hashtags?.length ?? 0;
    parts.push({ id: "hashtags", label: "Hashtags", score: distanceScore(n, range.min, range.max, 25), detail: `${n} hashtag${n === 1 ? "" : "s"}; the feed's rule: ${playbook.hashtagRule.trim().slice(0, 80)}.` });
  }

  const mix = playbook.formatMix ?? [];
  if (mix.length && post.format) {
    const pct = mix.find((m) => m.format === post.format)?.pct ?? 0;
    parts.push({ id: "format", label: "Post type", score: pct ? clamp(55 + pct * 2) : 35, detail: pct ? `This kind of post is about ${pct}% of the feed.` : "The feed rarely posts this kind of post." });
  }

  if (playbook.cta?.trim()) {
    const none = /\b(no|never|rarely|without)\b[^.]*(cta|call to action|ask)/i.test(playbook.cta);
    const has = !!post.cta?.trim();
    parts.push({ id: "closing", label: "Closing", score: none ? (has ? 45 : 100) : has ? 100 : 60, detail: none ? "The feed seldom closes with an ask." : `The feed closes like this: ${playbook.cta.trim().slice(0, 90)}.` });
  }

  const blacklist = playbook.blacklist ?? [];
  if (blacklist.length) {
    const bad = blacklist.filter((w) => w.trim().length > 3 && new RegExp(`\\b${escapeRe(w.trim())}\\b`, "i").test(caption));
    parts.push({ id: "words", label: "Wording", score: bad.length ? clamp(100 - bad.length * 40) : 100, detail: bad.length ? `Uses words the feed avoids: ${bad.join(", ")}.` : "No words the feed avoids." });
  }

  if (parts.length < 2) return { status: "unavailable", score: 0, parts };
  return { status: "ok", score: clamp(parts.reduce((a, p) => a + p.score, 0) / parts.length), parts };
}
