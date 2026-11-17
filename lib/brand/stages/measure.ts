import { loadCorpus } from "../../measure/corpus";
import { measureText, type TextMeasures } from "../../measure/text";
import type { IngestOutput } from "./ingest";
import type { StageDefinition } from "./types";

export interface MeasureOutput {
  textMeasures?: TextMeasures;
}

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
      return { patches: [], output: { textMeasures: m } };
    } catch (err) {
      report({ id: "measure", label: "Couldn't measure your writing", detail: err instanceof Error ? err.message : String(err), status: "warn" });
      return { patches: [], output: {} };
    }
  },
};
