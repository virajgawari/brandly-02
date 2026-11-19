import { paragraphs } from "../../measure/paragraphs";
import { FACETS, PERSONALITY_FACETS, facetPath, rateTexts, type Facet, type RateOptions } from "../../measure/rate";
import { MEASURE_VERSION } from "../../measure/version";
import type { TextMeasures } from "../../measure/text";
import { evidenceId, type Measures } from "../model";
import type { IngestOutput } from "./ingest";
import type { StageDefinition } from "./types";

/** A facet needs this many texts with a quoted score before its value replaces the LLM's guess. */
export const MIN_RATED_TEXTS = 5;
const BUDGET_MS = 50_000;

export type RateInput = IngestOutput & { textMeasures?: TextMeasures; /** Overrides for tests. */ rateOptions?: Partial<RateOptions> };

const path = facetPath;

/** An LLM judge scores personality and tone on sampled paragraphs; each score must quote the text. */
export const rateStage: StageDefinition<RateInput> = {
  id: "rate",
  label: "Rating your voice",
  reads: [],
  writes: ["personality", "voice"],
  async run(model, input, { report }) {
    const paras = paragraphs(input.sitePages ?? []);
    if (paras.length < 8) {
      report({ id: "rate", label: "Not enough copy to rate your voice", status: "warn" });
      return { patches: [], output: {} };
    }
    try {
      const r = await rateTexts(paras, { samples: 20, runs: 2, batchSize: 10, delayMs: 4000, deadlineMs: Date.now() + BUDGET_MS, ...input.rateOptions });
      const usable = FACETS.filter((f) => (r.ratings[f]?.n ?? 0) >= MIN_RATED_TEXTS);
      const measures: Measures | undefined = input.textMeasures
        ? {
            version: MEASURE_VERSION,
            at: new Date().toISOString(),
            text: input.textMeasures,
            rating: { facets: r.ratings, textsRated: r.textsRated, calls: r.calls, failedCalls: r.failedCalls },
          }
        : undefined;
      if (!usable.length) {
        report({ id: "rate", label: "Couldn't rate your voice, keeping the first guess", detail: `${r.failedCalls} of ${r.calls} checks failed`, status: "warn" });
        return { patches: [], output: measures ? { measures } : {} };
      }
      const siteEvidence = (input.sitePages ?? []).map((p) => evidenceId("website", p.url));
      const pick = <T,>(f: (k: Facet) => T) => Object.fromEntries(usable.map((k) => [path(k), f(k)]));
      const patch: Record<string, Record<string, number>> = { personality: {}, voice: {} };
      const tone: Record<string, number> = {};
      for (const f of usable) {
        const v = Math.round(r.ratings[f]!.value);
        if ((PERSONALITY_FACETS as readonly string[]).includes(f)) patch.personality[f] = v;
        else tone[f] = v;
      }
      const patches = [];
      if (Object.keys(patch.personality).length || Object.keys(tone).length) {
        patches.push({
          patch: { personality: patch.personality, voice: { tone } } as never,
          options: {
            source: "inferred" as const,
            method: "rated" as const,
            confidence: 0.3,
            confidenceByPath: pick((k) => r.ratings[k]!.confidence) as Record<string, number>,
            intervalByPath: pick((k) => r.ratings[k]!.interval.map((x) => Math.round(x)) as [number, number]) as Record<string, [number, number]>,
            evidenceByPath: pick(() => siteEvidence) as Record<string, string[]>,
            noteByPath: pick((k) => `Rated from ${r.ratings[k]!.n} site texts`) as Record<string, string>,
          },
        });
      }
      report({
        id: "rate",
        label: `Rated your voice from ${r.textsRated} passages`,
        detail: r.failedCalls ? `${r.failedCalls} of ${r.calls} checks failed` : undefined,
        status: "done",
      });
      return { patches, output: measures ? { measures } : {} };
    } catch (err) {
      report({ id: "rate", label: "Couldn't rate your voice, keeping the first guess", detail: err instanceof Error ? err.message : String(err), status: "warn" });
      return { patches: [], output: {} };
    }
  },
};
