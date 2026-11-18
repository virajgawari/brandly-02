// Deterministic checks on one generated post. No LLM calls, no server imports, so it is unit-testable.
// Used at runtime by generatePost and offline by scripts/eval.ts (via evals/score.ts).
export interface ScoreInput {
  post: { caption: string; hashtags: string[]; cta?: string; headline?: string; platformVariants?: Record<string, string> } | null;
  banned: string[];
  platforms: string[];
  limits: Record<string, { caption: number }>;
  /** Generation or schema error, if the model never produced a valid post. */
  error?: string;
}

export interface Scores {
  schemaOk: boolean;
  noBanned: boolean;
  captionWithinLimit: boolean;
  hashtagCount: boolean;
  noEmojiFirst: boolean;
  noDidYouKnow: boolean;
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
    hashtagCount: p.hashtags.length >= 5 && p.hashtags.length <= 10,
    noEmojiFirst: !firsts.some((t) => EMOJI.test(t)),
    noDidYouKnow: !/did you know/i.test(all),
  };
  const failures = [
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
  opts: { banned: string[]; platforms: string[]; limits: ScoreInput["limits"] }
): RuleCheck {
  const { passed, failures } = scorePost({ post, ...opts });
  return { passed, failures };
}
