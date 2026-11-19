import { z } from "zod";
import { AGE_GROUPS, MOMENTS, MOTIVATIONS } from "./model";
import { looksLikeUnitPersonality, clampPct, signedToTone, unitToPct, TONE_KEYS } from "./scale";
import { BUSINESS_MODEL_KEYS, INDUSTRY_KEYS, PRIMARY_GOAL_KEYS } from "./taxonomy";

// Lenient schemas: cheap models sometimes drop or mistype fields, so every
// field falls back to a safe default instead of failing the whole stage.
const str = z.string().catch("");
const strArr = z.array(z.string()).catch([]);
const unit = z.coerce.number().min(0).max(1).catch(0.5); // confidences stay 0–1
const opt = z.coerce.number().finite().optional().catch(undefined);

/** Which evidence refs (E1, E2…) the model says each field rests on. Bad shapes become {} so a stage never fails on it. */
export const CitesSchema = z
  .record(z.string(), z.array(z.string()).catch([]))
  .catch({})
  .default({});

/** Tone axes, 0–100. Replies that still use -1..1 (older prompts, the n8n workflow) are converted; gaps become 50. */
export const tonePct = z
  .object({ funny_serious: opt, formal_casual: opt, respectful_irreverent: opt, enthusiastic_matter: opt })
  .catch({} as Record<(typeof TONE_KEYS)[number], undefined>)
  .transform((t) => {
    const given = Object.fromEntries(TONE_KEYS.filter((k) => t[k] !== undefined).map((k) => [k, t[k] as number]));
    const signed = Object.keys(given).length > 0 && Object.values(given).every((v) => v >= -1 && v <= 1);
    return Object.fromEntries(TONE_KEYS.map((k) => [k, k in given ? (signed ? signedToTone(given[k]) : clampPct(Math.round(given[k]))) : 50])) as Record<(typeof TONE_KEYS)[number], number>;
  });

/** Aaker dimensions, 0–100. Replies using 0–1 are converted; gaps become the defaults. */
const PERSONALITY_DEFAULT = { sincerity: 50, excitement: 50, competence: 50, sophistication: 50, ruggedness: 20 };
export const personalityPct = z
  .object({ sincerity: opt, excitement: opt, competence: opt, sophistication: opt, ruggedness: opt })
  .catch({})
  .transform((p) => {
    const given = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as Record<string, number>;
    const unit = Object.keys(given).length > 0 && looksLikeUnitPersonality(given);
    return Object.fromEntries(
      Object.entries(PERSONALITY_DEFAULT).map(([k, d]) => [k, k in given ? (unit ? unitToPct(given[k]) : clampPct(Math.round(given[k]))) : d])
    ) as typeof PERSONALITY_DEFAULT;
  });
const hex = z
  .string()
  .regex(/^#?[0-9a-fA-F]{6}$/)
  .transform((h) => (h.startsWith("#") ? h : `#${h}`).toUpperCase())
  .optional()
  .catch(undefined);

/** Keeps only valid enum values instead of rejecting the whole array. */
function enumArr<T extends string>(values: readonly T[], max = 20) {
  return z
    .array(z.string())
    .catch([])
    .transform((arr) => [...new Set(arr.map((v) => v.trim().toLowerCase()))].filter((v): v is T => (values as readonly string[]).includes(v)).slice(0, max));
}

export const AudienceSchema = z.object({
  gender: z.enum(["women", "men", "all"]).optional().catch(undefined),
  ageGroups: enumArr(AGE_GROUPS),
  affluence: z.enum(["value", "mid", "premium", "luxury"]).optional().catch(undefined),
  countries: strArr,
  cityTiers: enumArr(["metro", "tier2", "tier3", "rural"] as const),
  languages: strArr,
  motivations: enumArr(MOTIVATIONS, 2),
  moments: enumArr(MOMENTS),
  psychographic: str,
});

export const ExtractSchema = z.object({
  oneLiner: str,
  offering: str,
  category: str,
  industry: z.enum(INDUSTRY_KEYS).optional().catch(undefined),
  businessModel: z.enum(BUSINESS_MODEL_KEYS).optional().catch(undefined),
  primaryGoal: z.enum(PRIMARY_GOAL_KEYS).optional().catch(undefined),
  problem: str,
  promise: str,
  differentiators: strArr,
  proofPoints: strArr,
  prism: z
    .object({
      physique: str,
      personality: str,
      culture: str,
      relationship: str,
      reflection: str,
      selfImage: str,
    })
    .catch({ physique: "", personality: "", culture: "", relationship: "", reflection: "", selfImage: "" }),
  archetype: str,
  personality: personalityPct,
  colors: z.object({ primary: hex, secondary: hex, accent: hex, neutral: hex }).catch({
    primary: undefined,
    secondary: undefined,
    accent: undefined,
    neutral: undefined,
  }),
  headingFont: str,
  bodyFont: str,
  typographyFeel: str,
  visualStyle: str,
  imageryStyle: str,
  tone: tonePct,
  voiceDescription: str,
  vocabularyUse: strArr,
  vocabularyAvoid: strArr,
  sampleLines: strArr,
  audience: AudienceSchema.catch({
    ageGroups: [],
    countries: [],
    cityTiers: [],
    languages: [],
    motivations: [],
    moments: [],
    psychographic: "",
  }),
  /** How sure the model is about the audience guess (0–1). */
  audienceConfidence: unit,
  vibe: strArr,
  productsServices: strArr,
  pillars: strArr,
  hashtagClusters: strArr,
  do: strArr,
  dont: strArr,
  cites: CitesSchema,
});
export type ExtractResult = z.infer<typeof ExtractSchema>;

export const ContentSystemSchema = z.object({
  pillars: strArr,
  categoryEntryPoints: strArr,
  hashtagClusters: strArr,
  do: strArr,
  dont: strArr,
  cites: CitesSchema,
});
export type ContentSystemResult = z.infer<typeof ContentSystemSchema>;

export const VisualInsightsSchema = z.object({
  colors: z.array(z.string()).catch([]),
  visualStyle: str,
  typographyFeel: str,
  vibe: strArr,
  productsServices: strArr,
  motifs: str,
  audienceHints: str,
  tone: str,
});
export type VisualInsights = z.infer<typeof VisualInsightsSchema>;

export const ImageTagSchema = z.object({
  index: z.coerce.number().catch(-1),
  subject: str,
  setting: str,
  style: str,
  people: z.enum(["none", "one", "group"]).catch("none"),
  textOnImage: z.boolean().catch(false),
  productVisible: z.boolean().catch(false),
  /** Short product name when a product is visible (max 6 words). */
  productName: z
    .string()
    .catch("")
    .transform((s) => s.trim().split(/\s+/).slice(0, 6).join(" ")),
});
export type ImageTags = z.infer<typeof ImageTagSchema>;
export const ImageTagsSchema = z.array(ImageTagSchema).catch([]);

// ── Generated post (generate-post@2) ────────────────────────────────────────
const shortList = (max: number) => z.array(z.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, max));

export const VisualBriefSchema = z.object({
  subject: str,
  setting: str,
  lighting: str,
  composition: str,
  usesProductPhoto: z.coerce.boolean().catch(false),
});

export const GeneratedPostSchema = z.object({
  caption: z.string().min(20),
  hashtags: shortList(10).transform((a) => a.map((h) => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, ""))),
  cta: str,
  headline: z.string().min(2).transform((h) => h.trim().replace(/^["']|["']$/g, "")),
  subline: str,
  items: shortList(6),
  stat: str,
  slides: z
    .array(z.object({ headline: str, body: str }))
    .catch([])
    .transform((a) => a.filter((s) => s.headline).slice(0, 10)),
  visualBrief: VisualBriefSchema.catch({ subject: "", setting: "", lighting: "", composition: "", usesProductPhoto: false }),
  bestTimeToPost: str,
  postType: str,
  platformVariants: z.record(z.string()).catch({}),
});
export type GeneratedPostResult = z.infer<typeof GeneratedPostSchema>;

// ── Layout kit (once per brand) ─────────────────────────────────────────────
export const LayoutKitSchema = z.object({
  layouts: z.array(z.string()).catch([]),
  radius: z.coerce.number().min(0).max(64).catch(16),
  photoTreatment: z.enum(["full", "framed", "duotone"]).catch("full"),
  headlineCase: z.enum(["upper", "title", "sentence"]).catch("sentence"),
  accentShape: z.enum(["none", "bar", "circle", "underline", "corner"]).catch("bar"),
  logoPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).catch("bottom-left"),
  background: z.enum(["primary", "secondary", "accent", "neutral"]).catch("primary"),
});
