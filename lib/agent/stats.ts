// Deterministic learning: turns a brand's posts and what people did with them into findings.
// Pure (no I/O, no LLM) so it is cheap, testable and explainable. The model only rephrases.
import { editRatio } from "@/lib/edit-ratio";

export type Dimension = "format" | "hook" | "layout" | "pillar" | "template" | "product";
export type Metric = "kept" | "edits" | "engagement";

export const DIMENSIONS: Dimension[] = ["format", "hook", "layout", "pillar", "template", "product"];

export interface LearnPost {
  id: string;
  status: "draft" | "scheduled" | "published" | "failed" | "discarded";
  format?: string;
  hook?: string;
  layout?: string;
  pillar?: string;
  template?: string;
  product?: string;
  originalCaption?: string;
  caption?: string;
  /** generation_feedback ratings (<= 0 is a thumbs-down). */
  ratings?: number[];
  /** Engagements per reach (or impressions), from post_metrics. */
  engagement?: number;
}

export interface AgentSettings {
  windowDays: number;
  /** Posts a group needs before it can produce a finding. */
  minSample: number;
  /** Relative difference from the brand's own average, e.g. 0.3 = 30% better or worse. */
  minLift: number;
  /** 0..1: how much engagement findings outrank "what the user kept" findings. */
  engagementWeight: number;
}

export const DEFAULT_SETTINGS: AgentSettings = { windowDays: 90, minSample: 4, minLift: 0.3, engagementWeight: 0.5 };

export function normaliseSettings(raw: Partial<AgentSettings> | null | undefined): AgentSettings {
  const clamp = (n: unknown, lo: number, hi: number, d: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d);
  return {
    windowDays: Math.round(clamp(raw?.windowDays, 7, 365, DEFAULT_SETTINGS.windowDays)),
    minSample: Math.round(clamp(raw?.minSample, 2, 100, DEFAULT_SETTINGS.minSample)),
    minLift: clamp(raw?.minLift, 0.05, 3, DEFAULT_SETTINGS.minLift),
    engagementWeight: clamp(raw?.engagementWeight, 0, 1, DEFAULT_SETTINGS.engagementWeight),
  };
}

export interface Finding {
  key: string;
  dimension: Dimension;
  value: string;
  metric: Metric;
  direction: "more" | "less";
  /** Posts in this group that had data for the metric. */
  n: number;
  /** Posts outside the group that had data. */
  baselineN: number;
  rate: number;
  baseline: number;
  /** (rate - baseline) / baseline, signed. */
  lift: number;
  confidence: number;
  evidencePostIds: string[];
  statement: string;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** The post's value for a metric, or undefined when there is nothing to measure. */
export function metricValue(p: LearnPost, metric: Metric): number | undefined {
  if (metric === "kept") {
    if (p.ratings?.some((r) => r <= 0)) return 0;
    if (p.status === "scheduled" || p.status === "published") return 1;
    if (p.status === "discarded") return 0;
    return undefined; // still a draft: no decision yet
  }
  if (metric === "edits") {
    if (!p.originalCaption || p.caption === undefined || p.status === "discarded") return undefined;
    return editRatio(p.originalCaption, p.caption);
  }
  return typeof p.engagement === "number" && Number.isFinite(p.engagement) ? p.engagement : undefined;
}

export function statementFor(f: Pick<Finding, "dimension" | "value" | "metric" | "direction" | "lift" | "n">): string {
  const what = f.dimension === "product" ? `posts about ${f.value}` : `${f.value} ${f.dimension === "template" ? "template posts" : f.dimension === "format" ? "posts" : `${f.dimension} posts`}`;
  const basis = `${f.n} posts`;
  if (f.metric === "engagement") {
    return f.direction === "more"
      ? `Your ${what} get ${pct(f.lift)} more engagement than your other posts (${basis}). Use them more.`
      : `Your ${what} get ${pct(f.lift)} less engagement than your other posts (${basis}). Use them less.`;
  }
  if (f.metric === "kept") {
    return f.direction === "more"
      ? `You keep and schedule ${what} more often than the rest (${pct(f.lift)} higher, ${basis}). Lean into them.`
      : `You drop or thumbs-down ${what} more often than the rest (${pct(f.lift)} lower keep rate, ${basis}). Use them less.`;
  }
  return f.direction === "more"
    ? `You barely edit ${what} (${pct(f.lift)} fewer rewrites than usual, ${basis}). The drafts already fit.`
    : `You rewrite ${what} heavily (${pct(f.lift)} more edits than usual, ${basis}). Draft them closer to how you write.`;
}

/**
 * Compare each group (e.g. format = "carousel") with the rest of the brand's posts
 * and return the differences that clear the sample-size and lift thresholds.
 */
export function findPatterns(posts: LearnPost[], settings: AgentSettings = DEFAULT_SETTINGS): Finding[] {
  const out: Finding[] = [];
  for (const metric of ["kept", "edits", "engagement"] as Metric[]) {
    const measured = posts.map((p) => ({ p, v: metricValue(p, metric) })).filter((x): x is { p: LearnPost; v: number } => x.v !== undefined);
    if (measured.length < settings.minSample * 2) continue;

    for (const dimension of DIMENSIONS) {
      const groups = new Map<string, typeof measured>();
      for (const m of measured) {
        const value = m.p[dimension];
        if (!value) continue;
        groups.set(value, [...(groups.get(value) ?? []), m]);
      }
      for (const [value, inGroup] of groups) {
        const rest = measured.filter((m) => m.p[dimension] !== value);
        if (inGroup.length < settings.minSample || rest.length < settings.minSample) continue;
        const rate = mean(inGroup.map((m) => m.v));
        const baseline = mean(rest.map((m) => m.v));
        if (baseline <= 0) continue; // a relative lift from zero means nothing
        const lift = (rate - baseline) / baseline;
        if (Math.abs(lift) < settings.minLift) continue;

        // Edits: more rewriting is the bad direction.
        const good = metric === "edits" ? lift < 0 : lift > 0;
        const direction: Finding["direction"] = good ? "more" : "less";
        // Grows with sample size and with how far past the threshold the lift is.
        const confidence = round3(Math.min(1, (inGroup.length / (settings.minSample * 3)) * 0.6 + Math.min(1, Math.abs(lift) / (settings.minLift * 3)) * 0.4));
        const base = { dimension, value, metric, direction, lift: round3(lift), n: inGroup.length };
        out.push({
          key: `${dimension}:${value}:${metric}:${direction}`,
          ...base,
          baselineN: rest.length,
          rate: round3(rate),
          baseline: round3(baseline),
          confidence,
          evidencePostIds: inGroup.map((m) => m.p.id).slice(0, 12),
          statement: statementFor(base),
        });
      }
    }
  }
  const weight = (f: Finding) => f.confidence * (f.metric === "engagement" ? 0.5 + settings.engagementWeight : 1.5 - settings.engagementWeight);
  return out.sort((a, b) => weight(b) - weight(a));
}

/** Keep the strongest finding per dimension+value so one idea never shows twice. */
export function topFindings(findings: Finding[], limit = 6): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    const id = `${f.dimension}:${f.value}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}

/** The prompt block built from the insights the user accepted. */
export function learnedBlock(accepted: { statement: string }[]): string {
  if (!accepted.length) return "";
  return `WHAT WORKS FOR THIS BRAND (learned from its own posts; follow when it fits the request, never force it):
${accepted.slice(0, 8).map((a) => `- ${a.statement}`).join("\n")}`;
}
