import { generateStructured } from "../../llm";
import { ContentSystemSchema } from "../schemas";
import { MOMENT_LABELS } from "../audience";
import { toPromptContext } from "../projection";
import { citeOptions, evidenceRefs, type CiteItem } from "../cite";
import type { BrandModel } from "../model";
import type { VisualImage } from "./visual";
import type { StageDefinition } from "./types";

const CONTENT_PATHS = {
  pillars: ["content.pillars"],
  categoryEntryPoints: ["content.categoryEntryPoints"],
  hashtagClusters: ["content.hashtagClusters"],
  do: ["content.do"],
  dont: ["content.dont"],
};

/** Measured facts the planner should start from: over-used words, contradictions, what the photos show. */
function measuredFacts(model: BrandModel, photos: VisualImage[] | undefined): string {
  const lines: string[] = [];
  const over = model.measures?.text?.lexicon?.over.slice(0, 8).map((w) => w.word) ?? [];
  if (over.length) lines.push(`Words their copy uses more than other brands in the industry: ${over.join(", ")}`);
  const clashes = (model.measures?.contradictions ?? []).slice(0, 3).map((c) => c.text);
  if (clashes.length) lines.push(`Where the profile and the measured copy disagree: ${clashes.join(" ")}`);
  const seen = (photos ?? []).filter((p) => p.tags).slice(0, 8).map((p) => `${p.tags!.subject} (${p.tags!.setting})`);
  if (seen.length) lines.push(`Their website photos show: ${seen.join("; ")}`);
  const palette = model.measures?.pixels?.photoPalette ?? [];
  if (palette.length) lines.push(`Photo palette (imagery only): ${palette.join(", ")}`);
  return lines.length ? `\nMeasured facts (use them, don't contradict them):\n${lines.join("\n")}\n` : "";
}

/** Fills content pillars, category entry points, hashtags and rules where they are missing or weak. */
export const contentSystemStage: StageDefinition<{ photoInsights?: VisualImage[] }> = {
  id: "content-system",
  label: "Planning what to post about",
  reads: ["strategy", "identity", "voice"],
  writes: ["content"],
  async run(model, input, { report }) {
    const hasEnough = model.content.pillars.length >= 3 && model.content.hashtagClusters.length >= 4;
    const moments = model.strategy.audience.moments.map((m) => MOMENT_LABELS[m]);
    if (hasEnough && model.content.categoryEntryPoints.length) {
      report({ id: "content", label: `${model.content.pillars.length} content pillars ready`, status: "done" });
      return { patches: [] };
    }
    report({ id: "content", label: "Planning content pillars", status: "info" });

    const items: CiteItem[] = model.evidence.map((e) => ({
      id: e.id,
      label: e.source === "website" ? (e.url ? `page ${e.url}` : "website") : `${e.source} images/screenshots`,
    }));
    const refs = evidenceRefs(items.slice(0, 8));
    const home = model.evidence.find((e) => e.source === "website")?.id;
    const fallback = home ? [home] : model.evidence.map((e) => e.id).slice(0, 1);

    const r = await generateStructured(
      ContentSystemSchema,
      "You are a social media strategist. Plan a simple, specific content system for this brand.",
      `${measuredFacts(model, input?.photoInsights)}${refs.block ? `\n${refs.block}\n` : ""}Return JSON:
{
  "pillars": ["4 content pillars, each 2-5 words"],
  "categoryEntryPoints": ["5 real-life moments when a customer would think of this brand${moments.length ? `, starting from: ${moments.join(", ")}` : ""}"],
  "hashtagClusters": ["8 hashtags with #, mix of broad and niche"],
  "do": ["3 content rules"],
  "dont": ["3 things to never post"]${refs.block ? `,
  "cites": {/* field name -> evidence refs it rests on, e.g. "pillars": ["E1"]. Fields: ${Object.keys(CONTENT_PATHS).join(", ")}. Leave a field out if it is a guess. */}` : ""}
}`,
      { task: "fast", maxTokens: 1050, cachedContext: toPromptContext(model) }
    );
    const { cites, ...content } = r;
    report({ id: "content", label: `Planned ${r.pillars.length} content pillars`, detail: r.pillars.join(" · "), status: "done" });
    return {
      patches: [
        {
          patch: { content },
          options: { source: "generated", confidence: 0.6, evidenceByPath: citeOptions(cites, CONTENT_PATHS, refs.resolve, fallback) },
        },
      ],
    };
  },
};
