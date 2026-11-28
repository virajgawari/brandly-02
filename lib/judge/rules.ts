import { groundingFailure, groundingIssues } from "./grounding";

// Deterministic checks on one generated post. No LLM calls, no server imports, so it is unit-testable.
// Used at runtime by generatePost and offline by scripts/eval.ts (via evals/score.ts).
export interface ScoreInput {
  post: { caption: string; hashtags: string[]; cta?: string; headline?: string; subline?: string; stat?: string; items?: string[]; platformVariants?: Record<string, string> } | null;
  banned: string[];
  platforms: string[];
  limits: Record<string, { caption: number }>;
  /** Generation or schema error, if the model never produced a valid post. */
  error?: string;
  /** Text the model was given. When set, specifics not found in it count as invented. */
  facts?: string;
  /** Allowed hashtag count; defaults to 5-10. Brands whose playbook says "1 hashtag" pass a tighter range. */
  hashtags?: { min: number; max: number };
}

export interface Scores {
  schemaOk: boolean;
  noBanned: boolean;
  captionWithinLimit: boolean;
  hashtagCount: boolean;
  noEmojiFirst: boolean;
  noDidYouKnow: boolean;
  /** Present only when facts were supplied. */
  grounded?: boolean;
}

const EMOJI = /^\s*(\p{Extended_Pictographic}|\p{Regional_Indicator})/u;
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function bannedHits(text: string, banned: string[]): string[] {
  return banned.filter((w) => w.trim().length > 3 && new RegExp(`\\b${esc(w.trim())}\\b`, "i").test(text));
}

export function scorePost(i: ScoreInput): { scores: Scores; passed: boolean; failures: string[] } {
  const p = i.post;
  if (!p) {
    const scores: Scores = { schemaOk: false, noBanned: false, captionWithinLimit: false, hashtagCount: false, noEmojiFirst: false, noDidYouKnow: false };
    return { scores, passed: false, failures: [i.error ? `schema: ${i.error}` : "no output"] };
  }
  const all = [p.caption, p.cta, p.headline, ...Object.values(p.platformVariants ?? {})].filter(Boolean).join("\n");
  const hits = bannedHits(all, i.banned);
  const limit = Math.min(...i.platforms.map((x) => i.limits[x]?.caption ?? Infinity));
  const variantOver = i.platforms.filter((x) => (p.platformVariants?.[x]?.length ?? 0) > (i.limits[x]?.caption ?? Infinity));
  const firsts = [p.caption, ...Object.values(p.platformVariants ?? {})];
  const scores: Scores = {
    schemaOk: true,
    noBanned: hits.length === 0,
    captionWithinLimit: p.caption.length <= limit && variantOver.length === 0,
    hashtagCount: p.hashtags.length >= (i.hashtags?.min ?? 5) && p.hashtags.length <= (i.hashtags?.max ?? 10),
    noEmojiFirst: !firsts.some((t) => EMOJI.test(t)),
    noDidYouKnow: !/did you know/i.test(all),
  };
  const invented = i.facts === undefined ? [] : groundingIssues({ ...p, caption: p.caption }, i.facts);
  if (i.facts !== undefined) scores.grounded = invented.length === 0;
  const failures = [
    invented.length > 0 && groundingFailure(invented),
    !scores.noBanned && `banned: ${hits.join(", ")}`,
    !scores.captionWithinLimit && `caption over limit (${p.caption.length}/${limit})`,
    !scores.hashtagCount && `hashtags: ${p.hashtags.length}`,
    !scores.noEmojiFirst && "emoji first",
    !scores.noDidYouKnow && '"Did you know"',
  ].filter((x): x is string => !!x);
  return { scores, passed: failures.length === 0, failures };
}

/** Runtime check of a generated post: banned words, platform limits, hashtags. */
export interface RuleCheck {
  passed: boolean;
  failures: string[];
}

export function checkRules(
  post: NonNullable<ScoreInput["post"]>,
  opts: { banned: string[]; platforms: string[]; limits: ScoreInput["limits"]; facts?: string; hashtags?: ScoreInput["hashtags"] }
): RuleCheck {
  const { passed, failures } = scorePost({ post, ...opts });
  return { passed, failures };
}
