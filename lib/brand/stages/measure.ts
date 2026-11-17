import { loadCorpus } from "../../measure/corpus";
import { measureText, type TextMeasures } from "../../measure/text";
import { MEASURE_VERSION } from "../../measure/version";
import type { IngestOutput } from "./ingest";
import type { StageDefinition } from "./types";

export interface PageMeasures {
  url: string;
  version: string;
  measures: TextMeasures;
}

export interface MeasureOutput {
  textMeasures?: TextMeasures;
  /** One entry per crawled page with enough words; stored next to the page in `brand_evidence`. */
  pageMeasures?: PageMeasures[];
}

/** Pages shorter than this say too little for the numbers to mean anything. */
export const MIN_PAGE_WORDS = 150;

/** Deterministic measures of the site copy. No LLM; the numbers feed extract and are kept on the model. */
export const measureStage: StageDefinition<IngestOutput> = {
  id: "measure",
  label: "Measuring your writing",
  reads: [],
  writes: [],
  async run(model, input, { report }) {
    const pages = input.sitePages ?? [];
    const texts = pages.map((p) => p.text).filter((t) => t && t.trim());
    if (!texts.length) return { patches: [], output: {} };
    try {
      const m = measureText(texts, { corpus: await loadCorpus(model.strategy.industry) });
      if (m.n < 150) {
        report({ id: "measure", label: "Not enough text to measure your writing", status: "warn" });
        return { patches: [], output: {} };
      }
      const bits = [
        m.sentenceLength ? `${Math.round(m.sentenceLength.mean)} words a sentence` : "",
        m.pronouns?.youWeRatio != null ? (m.pronouns.youWeRatio >= 1 ? "talks to 'you' more than 'we'" : "talks about 'we' more than 'you'") : "",
      ].filter(Boolean);
      report({ id: "measure", label: `Measured ${m.n.toLocaleString("en")} words of your copy`, detail: bits.join(", ") || undefined, status: "done" });
      // Per page without the corpus: no lexicon, so each row stays small.
      const pageMeasures: PageMeasures[] = [];
      for (const p of pages) {
        if (!p.text?.trim()) continue;
        const pm = measureText(p.text);
        if (pm.n >= MIN_PAGE_WORDS) pageMeasures.push({ url: p.url, version: MEASURE_VERSION, measures: pm });
      }
      return { patches: [], output: { textMeasures: m, pageMeasures } };
    } catch (err) {
      report({ id: "measure", label: "Couldn't measure your writing", detail: err instanceof Error ? err.message : String(err), status: "warn" });
      return { patches: [], output: {} };
    }
  },
};
