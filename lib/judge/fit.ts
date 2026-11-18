// Brand-fit judge: one LLM call scores a generated post on the same facets as onboarding,
// then compares each facet with the brand's own profile. No server imports, so it is unit-testable.
import type { BrandModel } from "../brand/model";
import { FACETS, PERSONALITY_FACETS, defaultJudge, scoreTexts, type Facet, type RateOptions } from "../measure/rate";

export const JUDGE_VERSION = "judge-fit@1";
/** Fit (100 - mean |gap|) at or above this passes. */
export const FIT_PASS = 75;
/** A single facet further than this from the brand fails the post. */
export const MAX_GAP = 30;
/** Gap that is worth showing in the scorecard. */
export const NOTABLE_GAP = 15;
/** Fewer scored facets than this is too little signal: the result is "unsure" and passes. */
export const MIN_FACETS = 3;

export interface FacetFit {
  facet: Facet;
  target: number;
  score: number;
  quote: string;
  /** score - target (negative = post is lower than the brand). */
  gap: number;
}

export interface FitCheck {
  status: "ok" | "unsure" | "skipped";
  /** 0..100, 100 - mean |gap|. Absent when skipped or unsure. */
  fit?: number;
  passed: boolean;
  facets: FacetFit[];
  /** Facets whose gap is over MAX_GAP. */
  offFacets: Facet[];
}

const SKIPPED: FitCheck = { status: "skipped", passed: true, facets: [], offFacets: [] };

const targetOf = (model: BrandModel, f: Facet): number | undefined => {
  const v = (PERSONALITY_FACETS as readonly string[]).includes(f)
    ? (model.personality as unknown as Record<string, number>)[f]
    : (model.voice.tone as unknown as Record<string, number>)[f];
  return typeof v === "number" ? v : undefined;
};

/** Pure comparison of judge scores with the brand profile. `scores` maps facet to score and quote. */
export function compareFit(model: BrandModel, scores: Partial<Record<Facet, { score: number; quote: string }>>): FitCheck {
  const facets: FacetFit[] = [];
  for (const facet of FACETS) {
    const s = scores[facet];
    const target = targetOf(model, facet);
    if (!s || target === undefined) continue;
    facets.push({ facet, target, score: s.score, quote: s.quote, gap: Math.round(s.score - target) });
  }
  if (facets.length < MIN_FACETS) return { status: "unsure", passed: true, facets, offFacets: [] };
  const fit = Math.round(100 - facets.reduce((a, f) => a + Math.abs(f.gap), 0) / facets.length);
  const offFacets = facets.filter((f) => Math.abs(f.gap) > MAX_GAP).map((f) => f.facet);
  return { status: "ok", fit, passed: fit >= FIT_PASS && offFacets.length === 0, facets, offFacets };
}

/** One judge call on the post's text. A judge failure returns status "skipped"; generation never fails because of it. */
export async function judgeFit(text: string, model: BrandModel, opts: Pick<RateOptions, "judge"> = {}): Promise<FitCheck> {
  try {
    const inner = opts.judge ?? defaultJudge;
    // scoreTexts keeps only scores that passed the quote check; capture the quotes to show them.
    const quotes: Partial<Record<Facet, string>> = {};
    const judge: NonNullable<RateOptions["judge"]> = async (batch) => {
      const reply = await inner(batch);
      const r = reply.ratings[0] as Record<string, { quote?: string } | undefined> | undefined;
      for (const f of FACETS) if (r?.[f]?.quote) quotes[f] = r[f]!.quote;
      return reply;
    };
    const { perRun, failedCalls } = await scoreTexts([text], { runs: 1, batchSize: 1, delayMs: 0, judge });
    if (failedCalls > 0) return SKIPPED;
    const got = perRun[0]?.[0] ?? {};
    const scores: Partial<Record<Facet, { score: number; quote: string }>> = {};
    for (const f of FACETS) if (typeof got[f] === "number") scores[f] = { score: got[f]!, quote: quotes[f] ?? "" };
    return compareFit(model, scores);
  } catch {
    return SKIPPED;
  }
}
