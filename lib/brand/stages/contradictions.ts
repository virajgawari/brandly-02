import { findContradictions } from "../contradictions";
import { MEASURE_VERSION } from "../../measure/version";
import type { Measures } from "../model";
import type { TextMeasures } from "../../measure/text";
import type { StageDefinition } from "./types";

/** Compares the measured numbers with the profile. No LLM; the result is stored on `model.measures`. */
export const contradictionsStage: StageDefinition<{ textMeasures?: TextMeasures }> = {
  id: "contradictions",
  label: "Checking your profile against your copy",
  reads: [],
  writes: [],
  async run(model, input, { report }) {
    const base: Measures | undefined = model.measures ?? (input.textMeasures ? { version: MEASURE_VERSION, at: new Date().toISOString(), text: input.textMeasures } : undefined);
    if (!base) return { patches: [], output: {} };
    const found = findContradictions(model, base);
    if (found.length)
      report({ id: "contradictions", label: `Found ${found.length} ${found.length === 1 ? "place" : "places"} where your copy disagrees with your profile`, status: "info" });
    return { patches: [], output: { measures: { ...base, contradictions: found } } };
  },
};
