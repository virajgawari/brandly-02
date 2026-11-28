import type { BrandModel } from "./model";
import { mergePatch } from "./merge";
import { ingestStage } from "./stages/ingest";
import { measureStage } from "./stages/measure";
import { visualStage } from "./stages/visual";
import { rateStage } from "./stages/rate";
import { contradictionsStage } from "./stages/contradictions";
import { extractStage } from "./stages/extract";
import { contentSystemStage } from "./stages/content-system";
import { validateStage } from "./stages/validate";
import { directionsStage } from "./stages/directions";
import { layoutKitStage } from "./stages/layout-kit";
import { socialStage } from "./stages/social";
import type { Finding, StageDefinition, StageResult } from "./stages/types";
import type { Compliance, Measures } from "./model";
import { withFeature } from "../llm-log";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const STAGES: Record<string, StageDefinition<any>> = {
  [ingestStage.id]: ingestStage,
  [measureStage.id]: measureStage,
  [visualStage.id]: visualStage,
  [extractStage.id]: extractStage,
  [rateStage.id]: rateStage,
  [contradictionsStage.id]: contradictionsStage,
  [contentSystemStage.id]: contentSystemStage,
  [validateStage.id]: validateStage,
  [directionsStage.id]: directionsStage,
  [layoutKitStage.id]: layoutKitStage,
  [socialStage.id]: socialStage,
};

/** A path through the loop is just an ordered list of stages. */
export const PIPELINES = {
  // Independent stages run together: measure+visual, then rate+content-system+layout-kit.
  analyse: ["ingest", ["measure", "visual"], "extract", ["rate", "content-system", "layout-kit"], "contradictions", "validate"],
  // Build and Refine reuse the same engine; their interview/direction stages plug in here.
  build: [["content-system", "layout-kit"], "validate"],
  // Runs after the Apify scrape job has stored the brand's real posts.
  social: ["social", "validate"],
  refine: ["ingest", ["measure", "visual"], "extract", ["rate", "content-system", "layout-kit"], "contradictions", "validate"],
} as const;

/** A stage that runs past its deadline is skipped, so one slow model never stalls the whole read. */
const STAGE_DEADLINE_MS: Record<string, number> = { rate: 12_000, "content-system": 15_000, "layout-kit": 12_000, visual: 15_000, social: 45_000 };

type StageRef = string | readonly string[];
export type PipelineId = keyof typeof PIPELINES;

export interface RunResult {
  model: BrandModel;
  findings: Finding[];
  issues: string[];
  applied: string[];
  skippedLocked: string[];
  /** Combined `output` of the stages (e.g. Build directions). */
  output: Record<string, unknown>;
}

/** Runs stages in order (stages in the same group run together), merging each patch (lock-aware) before the next group reads the model. */
export async function runStages(
  stageIds: readonly StageRef[],
  initial: BrandModel,
  input: Record<string, unknown>,
  onFinding: (f: Finding) => void = () => {},
  onPartial: (model: BrandModel) => void = () => {}
): Promise<RunResult> {
  let model = initial;
  let carry: Record<string, unknown> = { ...input };
  const findings = new Map<string, Finding>();
  const issues: string[] = [];
  const applied: string[] = [];
  const skippedLocked: string[] = [];
  let output: Record<string, unknown> = {};

  const report = (f: Finding) => {
    findings.set(f.id, f);
    onFinding(f);
  };

  const runOne = async (id: string, snapshot: BrandModel, snapshotCarry: Record<string, unknown>): Promise<StageResult> => {
    const stage = STAGES[id];
    if (!stage) throw new Error(`Unknown stage "${id}"`);
    const work = withFeature(`stage:${id}`, () => stage.run(snapshot, snapshotCarry, { report }));
    const limit = STAGE_DEADLINE_MS[id];
    if (!limit) return work;
    work.catch(() => {}); // a late failure after the deadline is not an error for the run
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<StageResult>((resolve) => {
      timer = setTimeout(() => {
        report({ id: `${id}-late`, label: `${stage.label}: took too long, skipped`, status: "warn" });
        resolve({ patches: [], output: {} });
      }, limit);
    });
    try {
      return await Promise.race([work, late]);
    } finally {
      clearTimeout(timer);
    }
  };

  for (const ref of stageIds) {
    const ids = typeof ref === "string" ? [ref] : ref;
    const snapshot = model;
    const snapshotCarry = carry;
    // Stages in a group read the same model; results merge in listed order afterwards.
    const results = await Promise.all(ids.map((id) => runOne(id, snapshot, snapshotCarry)));
    for (const result of results) {
      for (const { patch, options } of result.patches) {
        const merged = mergePatch(model, patch, options);
        model = merged.model;
        applied.push(...merged.applied);
        skippedLocked.push(...merged.skippedLocked);
      }
      if (result.evidence?.length) model = { ...model, evidence: [...model.evidence.filter((e) => !result.evidence!.some((n) => n.source === e.source)), ...result.evidence] };
      const compliance = result.output?.compliance as Compliance | undefined;
      if (compliance) model = { ...model, compliance };
      const measures = result.output?.measures as Measures | undefined;
      if (measures) model = { ...model, measures };
      if (result.issues) issues.push(...result.issues);
      carry = { ...carry, ...(result.output ?? {}) };
      output = { ...output, ...(result.output ?? {}) };
    }
    onPartial(model);
  }

  // Raw website evidence is large and already summarised in model.evidence.
  delete output.website;
  delete output.visualPre;
  delete output.visualPending;
  return { model, findings: [...findings.values()], issues, applied, skippedLocked, output };
}
