import { generateStructured } from "../../llm";
import { dedupeColors, hexToRgb } from "../color";
import { complianceFor } from "../audience";
import { ExtractSchema } from "../schemas";
import { citeOptions, evidenceRefs, type CiteItem } from "../cite";
import { AGE_GROUPS, MOMENTS, MOTIVATIONS, evidenceId, type ModelPatch } from "../model";
import { BUSINESS_MODEL_KEYS, INDUSTRY_KEYS, PRIMARY_GOAL_KEYS } from "../taxonomy";
import type { IngestOutput } from "./ingest";
import type { TextMeasures } from "../../measure/text";
import type { StageDefinition, StagePatch } from "./types";
import type { BrandModel } from "../model";

const SYSTEM = `You are a senior brand strategist. You turn evidence about a real business into a precise brand profile.
Be concrete and specific to this business. Never invent facts that contradict the evidence.
When evidence is thin, make a sensible, modest guess and keep it short.`;

const near = (a: string, b: string) => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) < 30;
};

/** Short excerpts of the other crawled pages, capped so the prompt stays within small-model limits. */
function otherPages(pages: IngestOutput["pages"]): { text: string; urls: string[] } {
  if (!pages?.length) return { text: "", urls: [] };
  let budget = 5000;
  const out: string[] = [];
  const urls: string[] = [];
  for (const p of pages) {
    const piece = `${new URL(p.url).pathname} | ${p.title} | ${p.headings.slice(0, 4).join(" / ")} | ${p.text.slice(0, 350)}`;
    if (piece.length > budget) break;
    budget -= piece.length;
    out.push(piece);
    urls.push(p.url);
  }
  return { text: out.length ? `\nOther pages on the site (path | title | headlines | excerpt):\n${out.join("\n")}` : "", urls };
}

/** The evidence the prompt actually shows: the home page, the other pages that fit, and any image/PDF source. */
function citableEvidence(model: BrandModel, ev: ExtractInput, pageUrls: string[]): CiteItem[] {
  const items: CiteItem[] = [];
  if (ev.website) items.push({ id: evidenceId("website", ev.website.url), label: `home page ${ev.website.url}` });
  for (const u of pageUrls) items.push({ id: evidenceId("website", u), label: `page ${new URL(u).pathname}` });
  for (const e of model.evidence) if (e.source !== "website") items.push({ id: e.id, label: `${e.source} images/screenshots` });
  return items;
}

/** Model paths each cited field key stands for. */
const CITE_PATHS: Record<string, string[]> = {
  oneLiner: ["identity.oneLiner"],
  offering: ["strategy.offering"],
  category: ["strategy.category"],
  problem: ["strategy.problem"],
  promise: ["strategy.promise"],
  differentiators: ["strategy.differentiators"],
  proofPoints: ["strategy.proofPoints"],
  prism: ["physique", "personality", "culture", "relationship", "reflection", "selfImage"].map((k) => `identity.prism.${k}`),
  archetype: ["identity.archetype"],
  tone: ["funny_serious", "formal_casual", "respectful_irreverent", "enthusiastic_matter"].map((k) => `voice.tone.${k}`),
  voiceDescription: ["voice.description"],
  vocabularyUse: ["voice.vocabulary.use"],
  sampleLines: ["voice.sampleLines"],
  audience: ["gender", "ageGroups", "affluence", "languages", "motivations", "moments", "psychographic"]
    .map((k) => `strategy.audience.${k}`)
    .concat(["strategy.audience.markets.countries", "strategy.audience.markets.cityTiers"]),
  productsServices: ["content.productsServices"],
  pillars: ["content.pillars"],
  visualStyle: ["expression.visualStyle"],
  imageryStyle: ["expression.imageryStyle"],
  typographyFeel: ["expression.typographyFeel"],
};
const CITE_KEYS = Object.keys(CITE_PATHS);

/** The deterministic numbers from the measure stage, so the model's tone guesses start from facts. */
function measuredBlock(m: TextMeasures | undefined): string {
  if (!m || m.n < 150) return "";
  const lines = [
    m.sentenceLength ? `average sentence ${Math.round(m.sentenceLength.mean)} words (longest tenth ${Math.round(m.sentenceLength.p90)})` : "",
    m.readability ? `Flesch reading ease ${Math.round(m.readability.fleschReadingEase)}` : "",
    m.pronouns?.youWeRatio != null ? `you:we ratio ${m.pronouns.youWeRatio.toFixed(1)}` : "",
    `exclamations per 100 words ${m.exclamationPer100Words.toFixed(1)}`,
    `emoji per 100 words ${m.emojiPer100Words.toFixed(1)}`,
    `concreteness ${Math.round(m.concreteness)}/100`,
    m.lexicon?.over.length ? `words used more than other brands in the industry: ${m.lexicon.over.slice(0, 8).map((w) => w.word).join(", ")}` : "",
  ].filter(Boolean);
  return `
Measured from the site copy (facts, not guesses): ${lines.join("; ")}`;
}

type ExtractInput = IngestOutput & { textMeasures?: TextMeasures; pixels?: { logoPalette: string[]; photoPalette: string[] } };

function buildPrompt(name: string, ev: ExtractInput, detectedColors: string[], pages: string, citeBlock: string): string {
  const site = ev.website;
  const logoColors = ev.pixels?.logoPalette ?? [];
  const photoColors = ev.pixels?.photoPalette ?? [];
  return `Brand name: ${name}
${site ? `Website: ${site.url}
Title: ${site.title}
Meta description: ${site.description}
Headlines: ${site.headings.join(" | ")}
Detected fonts (from CSS): ${site.fonts.join(", ") || "none"}
Page copy (excerpt): ${site.copySample.slice(0, 3500)}${pages}${measuredBlock(ev.textMeasures)}` : "Website: not provided"}
${ev.visual ? `Visual analysis of catalogue/social images: ${JSON.stringify(ev.visual)}` : ""}
${ev.igHandle ? `Instagram handle: @${ev.igHandle} (posts not read)` : ""}
Detected brand colours, most used first: ${detectedColors.join(", ") || "none"}
${logoColors.length ? `Logo colours, measured from the logo's pixels (prefer these for primary): ${logoColors.join(", ")}` : ""}
${photoColors.length ? `Photo palette (for photography and imagery only, never UI colours): ${photoColors.join(", ")}` : ""}
${citeBlock}

Return JSON with exactly these keys:
{
  "oneLiner": "what the brand is, in under 15 words",
  "offering": "what they sell, plain words",
  "category": "market category",
  "industry": one of ${JSON.stringify(INDUSTRY_KEYS)},
  "businessModel": one of ${JSON.stringify(BUSINESS_MODEL_KEYS)},
  "primaryGoal": the most likely marketing goal, one of ${JSON.stringify(PRIMARY_GOAL_KEYS)},
  "problem": "customer problem they solve",
  "promise": "the core promise",
  "differentiators": ["up to 3"],
  "proofPoints": ["up to 4 concrete facts the sources state outright (numbers, awards, years, counts, certifications, named places). Copy them as written. Empty list if the sources state none; never infer or invent"],
  "prism": {"physique": "", "personality": "", "culture": "", "relationship": "", "reflection": "", "selfImage": ""},
  "archetype": "one Jungian brand archetype name",
  "personality": {"sincerity": 0-100, "excitement": 0-100, "competence": 0-100, "sophistication": 0-100, "ruggedness": 0-100},
  "colors": {"primary": "#RRGGBB", "secondary": "#RRGGBB", "accent": "#RRGGBB", "neutral": "#RRGGBB"},
  "headingFont": "", "bodyFont": "", "typographyFeel": "", "visualStyle": "", "imageryStyle": "",
  "tone": {/* each 0-100: 0 = the first word of the name, 100 = the second */ "funny_serious": 0-100, "formal_casual": 0-100, "respectful_irreverent": 0-100, "enthusiastic_matter": 0-100},
  "voiceDescription": "2 sentences on how they write",
  "vocabularyUse": ["words/phrases they use"], "vocabularyAvoid": ["words to avoid"],
  "sampleLines": ["3 short lines in their voice"],
  "audience": {
    "gender": "women" | "men" | "all",
    "ageGroups": subset of ${JSON.stringify(AGE_GROUPS)},
    "affluence": "value" | "mid" | "premium" | "luxury",
    "countries": [], "cityTiers": subset of ["metro","tier2","tier3","rural"],
    "languages": ["languages the copy uses or customers likely prefer"],
    "motivations": up to 2 of ${JSON.stringify(MOTIVATIONS)},
    "moments": subset of ${JSON.stringify(MOMENTS)},
    "psychographic": "one sentence on lifestyle and values"
  },
  "audienceConfidence": 0-1,
  "vibe": ["4 words"], "productsServices": ["up to 5"],
  "pillars": ["4 content pillars"], "hashtagClusters": ["6 hashtags with #"],
  "do": ["3 rules"], "dont": ["3 rules"]${citeBlock ? `,
  "cites": {/* field name -> evidence refs it rests on, e.g. "offering": ["E1","E3"]. Fields: ${CITE_KEYS.join(", ")}. Cite only refs that support the field; leave a field out if it is a guess. */}` : ""}
}
Colour rules: if colours were detected, choose primary/secondary/accent ONLY from the detected list. neutral is a light background colour.
Font rules: use detected fonts when available.`;
}

export const extractStage: StageDefinition<ExtractInput> = {
  id: "extract",
  label: "Building your brand profile",
  reads: [],
  writes: ["strategy", "identity", "personality", "expression", "voice", "content"],
  async run(model, ev, { report }) {
    const logoColors = ev.pixels?.logoPalette ?? [];
    const detectedColors = dedupeColors([...logoColors, ...(ev.website?.colors ?? []), ...(ev.visual?.colors ?? [])]).slice(0, 8);
    if (!ev.website && !ev.visual && !ev.igHandle) {
      throw new Error("Nothing to analyse yet. Add a website, Instagram screenshots or a PDF.");
    }

    report({ id: "synth", label: "Putting your brand profile together", status: "info" });
    const pages = otherPages(ev.pages);
    const refs = evidenceRefs(citableEvidence(model, ev, pages.urls));
    const r = await generateStructured(ExtractSchema, SYSTEM, buildPrompt(model.name, ev, detectedColors, pages.text, refs.block), {
      task: "creative",
      maxTokens: 2500,
    });

    const patches: StagePatch[] = [];
    const measured = !!ev.textMeasures && ev.textMeasures.n >= 150;
    // What each field cites: the model's refs when valid, else the home page (copy) or the image sources (visual).
    const homeIds = ev.website ? [evidenceId("website", ev.website.url)] : [];
    const imageIds = model.evidence.filter((e) => e.source !== "website").map((e) => e.id);
    const fallback: Record<string, string[]> = Object.fromEntries(
      CITE_KEYS.map((k) => [k, ["visualStyle", "imageryStyle", "typographyFeel"].includes(k) ? [...imageIds, ...homeIds] : k === "audience" ? [...homeIds, ...imageIds] : homeIds.length ? homeIds : imageIds])
    );
    const cited = citeOptions(r.cites, CITE_PATHS, refs.resolve, fallback);
    const only = (...keys: string[]) => Object.fromEntries(keys.flatMap((k) => CITE_PATHS[k]).map((p) => [p, cited[p]]));
    // Evidence the colours came from (the website's styles or the studied images).
    const colourEvidenceIds = [...model.evidence, ...(ev.website ? [{ id: evidenceId("website", ev.website.url), colors: ev.website.colors }] : [])]
      .filter((e) => e.colors?.length)
      .map((e) => e.id);
    const fromEvidence = (hex?: string) => !!hex && detectedColors.some((d) => near(d, hex));
    const fromLogo = (hex?: string) => !!hex && logoColors.some((d) => near(d, hex));

    // Colours: high confidence only when they match what we actually saw.
    const colorConf: Record<string, number> = {};
    const color: Record<string, { $type: "color"; $value: string }> = {};
    (["primary", "secondary", "accent", "neutral"] as const).forEach((role) => {
      const hex = r.colors[role];
      if (!hex) return;
      color[role] = { $type: "color", $value: hex };
      colorConf[`expression.tokens.color.${role}`] = role === "neutral" ? 0.75 : fromEvidence(hex) ? 0.95 : 0.4;
    });
    patches.push({
      patch: { expression: { tokens: { color } } } as ModelPatch,
      options: {
        source: "extracted",
        confidence: 0.4,
        confidenceByPath: colorConf,
        method: detectedColors.length ? "css" : "llm",
        evidenceByPath: Object.fromEntries(Object.keys(colorConf).map((p) => [p, detectedColors.length ? colourEvidenceIds : []])),
        noteByPath: Object.fromEntries(
          (["primary", "secondary", "accent", "neutral"] as const)
            .filter((role) => r.colors[role])
            .map((role) => [
              `expression.tokens.color.${role}`,
              fromLogo(r.colors[role]) ? "measured from your logo" : detectedColors.length ? "website / image colours" : "AI guess",
            ])
        ),
      },
    });

    // Fonts
    const detectedFonts = ev.website?.fonts ?? [];
    const fontConf = (f: string) => (detectedFonts.some((d) => d.toLowerCase() === f.toLowerCase()) ? 0.9 : 0.45);
    patches.push({
      patch: {
        expression: {
          tokens: {
            font: {
              heading: r.headingFont ? { $type: "fontFamily", $value: r.headingFont } : undefined,
              body: r.bodyFont ? { $type: "fontFamily", $value: r.bodyFont } : undefined,
            },
          },
        },
      },
      options: {
        source: "extracted",
        confidence: 0.45,
        confidenceByPath: {
          "expression.tokens.font.heading": fontConf(r.headingFont),
          "expression.tokens.font.body": fontConf(r.bodyFont),
        },
      },
    });

    if (ev.website?.logoUrl) {
      patches.push({ patch: { expression: { logoUrl: ev.website.logoUrl } }, options: { source: "extracted", confidence: 0.85 } });
    }

    // Audience is always a guess from public sources → always ask the user to confirm.
    const a = r.audience;
    patches.push({
      patch: {
        strategy: {
          audience: {
            gender: a.gender,
            ageGroups: a.ageGroups,
            affluence: a.affluence,
            markets: { countries: a.countries, cityTiers: a.cityTiers },
            languages: a.languages,
            motivations: a.motivations,
            moments: a.moments,
            psychographic: a.psychographic,
          },
        },
      },
      options: { source: "inferred", confidence: Math.min(0.5, r.audienceConfidence * 0.6), evidenceByPath: only("audience") },
    });

    // Classification: a guess the user should confirm (low confidence → needs-check).
    if (r.industry || r.businessModel || r.primaryGoal) {
      patches.push({
        patch: { strategy: { industry: r.industry, businessModel: r.businessModel, primaryGoal: r.primaryGoal } },
        options: { source: "inferred", confidence: 0.4 },
      });
    }

    // Everything else: a reasonable inference from the evidence.
    patches.push({
      patch: {
        strategy: {
          category: r.category,
          offering: r.offering,
          problem: r.problem,
          promise: r.promise,
          differentiators: r.differentiators,
          proofPoints: r.proofPoints,
        },
        identity: { prism: r.prism, archetype: r.archetype, oneLiner: r.oneLiner },
        expression: { typographyFeel: r.typographyFeel, visualStyle: r.visualStyle, imageryStyle: r.imageryStyle },
        voice: {
          tone: r.tone,
          description: r.voiceDescription,
          vocabulary: { use: r.vocabularyUse, avoid: r.vocabularyAvoid },
          sampleLines: r.sampleLines,
        },
        content: {
          vibe: r.vibe,
          productsServices: r.productsServices,
          pillars: r.pillars,
          hashtagClusters: r.hashtagClusters,
          do: r.do,
          dont: r.dont,
        },
      },
      options: {
        source: "inferred",
        confidence: ev.website ? 0.7 : 0.55,
        evidenceByPath: cited,
        noteByPath: measured ? Object.fromEntries(CITE_PATHS.tone.map((p) => [p, "tone guessed from the copy, then checked against measured copy stats"])) : undefined,
      },
    });
    patches.push({
      patch: { personality: r.personality },
      options: { source: "inferred", confidence: 0.6, method: "llm", evidenceByPath: Object.fromEntries(Object.keys(r.personality).map((k) => [`personality.${k}`, refs.resolve([...(r.cites.tone ?? []), ...(r.cites.voiceDescription ?? [])]).length ? refs.resolve([...(r.cites.tone ?? []), ...(r.cites.voiceDescription ?? [])]) : homeIds.length ? homeIds : model.evidence.map((e) => e.id)])) },
    });

    report({
      id: "synth",
      label: "Brand profile ready",
      detail: r.oneLiner || undefined,
      status: "done",
    });

    return {
      patches,
      output: { compliance: complianceFor({ ageGroups: a.ageGroups }) },
    };
  },
};
