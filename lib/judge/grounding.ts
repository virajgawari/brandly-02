// Deterministic check that a post does not invent facts. No LLM calls, no server imports.
// "Facts" is the text the model was given: brand context, the request, product names.
// Anything specific in the post (a number, a promo code, a named person or place, a guarantee)
// that cannot be found in that text is reported, and the post goes to the revise pass.

export interface GroundedPost {
  caption: string;
  headline?: string;
  subline?: string;
  cta?: string;
  stat?: string;
  items?: string[];
  platformVariants?: Record<string, string>;
}

const COMMON_NAMES = new Set(
  [
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
    "instagram", "facebook", "linkedin", "twitter", "tiktok", "youtube", "pinterest", "whatsapp", "google", "reels", "story", "stories",
    "pov", "cta", "english", "hindi",
  ].map((w) => w.toLowerCase())
);

/** Claims a brand must not make unless its own facts say so. */
const CLAIMS = /\b(guarantee[sd]?|award[- ]winning|free (?:shipping|delivery)|money[- ]back|limited (?:edition|run|batch)|sold out|best[- ]selling|#1)\b/gi;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Strips hashtags and @handles; they are checked elsewhere (hashtag rules) and are not claims. */
const strip = (t: string) => t.replace(/[#@][\p{L}\p{N}_]+/gu, " ");

function inFacts(facts: string, word: string): boolean {
  const w = word.toLowerCase();
  // Prefix match so "Indian" is covered by "India", but "Ravi" is not covered by "gravity".
  const prefix = w.length >= 6 ? w.slice(0, w.length - 2) : w;
  return new RegExp(`(^|[^\\p{L}])${escape(prefix)}`, "iu").test(facts);
}

function numbersIn(text: string, facts: string): string[] {
  const out: string[] = [];
  const re = /([₹$€£]\s?)?(\d[\d,]*(?:\.\d+)?)\s?(%|x\b|k\b|-?\s?(?:hours?|hrs?|days?|mins?|minutes?|weeks?|months?))?/gi;
  for (const m of text.matchAll(re)) {
    const digits = m[2].replace(/,/g, "");
    const decorated = !!(m[1] || m[3]);
    if (!decorated && /^\d+$/.test(digits) && Number(digits) <= 10) continue; // "5 steps", "3 items"
    if (/^(19|20)\d{2}$/.test(digits)) continue; // years
    if (new RegExp(`(^|[^\\d.])${escape(digits)}($|[^\\d])`).test(facts.replace(/,/g, ""))) continue;
    out.push(m[0].trim());
  }
  return out;
}

function namesIn(text: string, facts: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b[A-Z][a-z]{2,}\b/g)) {
    // Sentence start: only spaces, quotes, emoji or brackets since the start or the last . ! ? … or line break.
    if (/(^|[.!?…\n])[^\p{L}\p{N}]*$/u.test(text.slice(0, m.index))) continue;
    if (COMMON_NAMES.has(m[0].toLowerCase()) || inFacts(facts, m[0])) continue;
    out.push(m[0]);
  }
  return out;
}

/** Specifics in the post that are not in the facts it was given. Empty means grounded. */
export function groundingIssues(post: GroundedPost, facts: string): string[] {
  const loose = [post.caption, post.cta, ...Object.values(post.platformVariants ?? {})].filter(Boolean).map((t) => strip(t as string)).join("\n");
  const visual = [post.headline, post.subline, post.stat, ...(post.items ?? [])].filter(Boolean).map((t) => strip(t as string)).join("\n");
  const all = `${loose}\n${visual}`;
  const f = facts;

  const found = new Set<string>();
  for (const n of numbersIn(all, f)) found.add(n);
  for (const m of all.matchAll(/\b(?:code|coupon|promo(?:code)?)\s+["“']?([A-Z0-9]{4,})/gi)) if (!inFacts(f, m[1])) found.add(`code ${m[1]}`);
  for (const m of all.matchAll(/\b[A-Z]{5,}\b/g)) if (!inFacts(f, m[0])) found.add(m[0]);
  for (const m of all.matchAll(CLAIMS)) if (!f.toLowerCase().includes(m[0].toLowerCase())) found.add(m[0]);
  for (const n of namesIn(loose, f)) found.add(n);
  return [...found].slice(0, 8);
}

/** Message for the revise prompt. */
export function groundingFailure(issues: string[]): string {
  return `invented details that are not in the brand context or the request: ${issues.join(", ")}. Remove them or write around them; do not replace them with other made-up details`;
}
