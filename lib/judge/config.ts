// Thresholds shared by the judge (server) and the composer scorecard (client). No imports, so safe anywhere.
export const JUDGE_VERSION = "judge-fit@1";
/** Fit (100 - mean |gap|) at or above this passes. */
export const FIT_PASS = 75;
/** A single facet further than this from the brand fails the post. */
export const MAX_GAP = 30;
/** Gap that is worth showing in the scorecard. */
export const NOTABLE_GAP = 15;
/** Fewer scored facets than this is too little signal: the result is "unsure" and passes. */
export const MIN_FACETS = 3;
