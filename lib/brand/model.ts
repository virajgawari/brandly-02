// ── Canonical Brand Model ───────────────────────────────────────────────────
// One model for every brand, whether its identity was extracted from existing
// sources (Door A, "analyse") or built from scratch (Door B, "build").
// Layers follow established brand frameworks:
//   strategy    → STP / positioning
//   identity    → Kapferer Brand Identity Prism
//   personality → Aaker (1997) brand personality dimensions
//   expression  → W3C Design Tokens (DTCG 2025.10) shaped visual tokens
//   voice       → NN/g four dimensions of tone
//   content     → pillars + Ehrenberg-Bass category entry points / distinctive assets

import type { Platform } from "@/lib/types";
import type { PostStats } from "@/lib/social/stats";
import type { TextMeasures } from "@/lib/measure/text";
import type { RatingResult } from "@/lib/measure/rate";
import type { Contradiction } from "./contradictions";
import type { ImageTags } from "./schemas";
import type { BusinessModel, Industry, PrimaryGoal } from "./taxonomy";

/** Current model shape. 1 (or unset) = old scales: personality 0–1, tone -1..1. 2 = both 0–100. */
export const MODEL_SCHEMA_VERSION = 2;

export type BrandMode = "analyse" | "build" | "refine";

export type Gender = "women" | "men" | "all";
export type AgeGroup = "13-17" | "18-24" | "25-34" | "35-44" | "45-54" | "55+";
export type Affluence = "value" | "mid" | "premium" | "luxury";
export type CityTier = "metro" | "tier2" | "tier3" | "rural";

export const AGE_GROUPS: AgeGroup[] = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"];

export const MOTIVATIONS = [
  "save_time_money",
  "status",
  "health",
  "fun",
  "trust",
  "belonging",
  "self_improvement",
] as const;
export type Motivation = (typeof MOTIVATIONS)[number];

export const MOMENTS = [
  "gifting",
  "festivals",
  "daily_routine",
  "weekends",
  "special_occasions",
  "problem",
  "work_hours",
] as const;
export type Moment = (typeof MOMENTS)[number];

export interface Audience {
  gender?: Gender;
  ageGroups: AgeGroup[];
  affluence?: Affluence;
  markets: { countries: string[]; cityTiers: CityTier[] };
  languages: string[];
  motivations: Motivation[];
  moments: Moment[];
  // Optional, asked later (Refine)
  buyerType?: "b2c" | "b2b";
  buyerIsUser?: boolean;
  lifeStages?: string[];
  channels?: string[];
  interests?: string[];
  objections?: string[];
  psychographic: string;
  notes?: string;
}

/** Real-world contact details. Optional; fed into post calls to action. */
export interface BusinessDetails {
  address?: string;
  phone?: string;
  hours?: string;
  /** Where a call to action should send people (booking page, shop, WhatsApp link). */
  ctaLink?: string;
  ctaLabel?: string;
}

export interface Strategy {
  category: string;
  /** Controlled lists (lib/brand/taxonomy.ts); unset on brands made before classification existed. */
  industry?: Industry;
  businessModel?: BusinessModel;
  primaryGoal?: PrimaryGoal;
  offering: string; // what they sell, in plain words
  audience: Audience;
  problem: string;
  promise: string;
  differentiators: string[];
  proofPoints: string[];
  competitors: string[];
  business?: BusinessDetails;
}

export interface Prism {
  physique: string;
  personality: string;
  culture: string;
  relationship: string;
  reflection: string;
  selfImage: string;
}

export interface Identity {
  prism: Prism;
  archetype?: string;
  mission: string;
  oneLiner: string;
}

/** Aaker dimensions, each 0–100. */
export interface Personality {
  sincerity: number;
  excitement: number;
  competence: number;
  sophistication: number;
  ruggedness: number;
}
export type PersonalityKey = keyof Personality;
export const PERSONALITY_KEYS: PersonalityKey[] = [
  "sincerity",
  "excitement",
  "competence",
  "sophistication",
  "ruggedness",
];

/** DTCG-shaped token, simplified to the fields Brandly needs. */
export interface ColorToken {
  $type: "color";
  $value: string; // hex
}
export interface FontToken {
  $type: "fontFamily";
  $value: string;
}

// ── Branded post layouts ────────────────────────────────────────────────────
export const LAYOUT_IDS = [
  "photo-band",
  "full-bleed",
  "big-number",
  "quote",
  "split",
  "framed",
  "checklist",
  "myth-fact",
  "carousel-cover",
  "carousel-slide",
  "product-cover",
  "product-slide",
] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

export type ColorRole = "primary" | "secondary" | "accent" | "neutral";

/** How this brand's posts are laid out. Chosen once per brand, editable on the brand page. */
export interface LayoutKit {
  /** The 5–7 layouts this brand uses (carousel-slide is always allowed for carousels). */
  layouts: LayoutId[];
  /** Corner radius in px at 1080 wide. */
  radius: number;
  photoTreatment: "full" | "framed" | "duotone";
  headlineCase: "upper" | "title" | "sentence";
  accentShape: "none" | "bar" | "circle" | "underline" | "corner";
  logoPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Which brand colour fills the background of text-led layouts. */
  background: ColorRole;
}

/** A real brand photo stored in the `images` bucket. */
export interface BrandPhoto {
  /** Storage path inside the `images` bucket. */
  path: string;
  sourceUrl?: string;
  source: "website" | "instagram" | "upload";
  addedAt: string;
  /** Dominant colours measured from the pixels (website photos). */
  colors?: string[];
  /** What a vision model saw in the photo. */
  tags?: ImageTags;
  /** "product" photos feed product carousels. Missing means an ordinary lifestyle photo. */
  role?: "product" | "lifestyle";
  /** Name (and optional note) of the product in a product photo. */
  product?: { name: string; note?: string };
}

/** Visual identity reverse-engineered from the brand's real top posts. */
export interface StyleGuide {
  medium: string;
  palette: string;
  composition: string;
  typography: string;
  /** Share (0-100) of the brand's images that carry overlaid text. */
  textOnImagePct?: number;
  /** Dominant on-image text colour as a #hex, as seen in the brand's posts. */
  textColor?: string;
  /** Id from FONT_PAIRS (lib/brand/fonts.ts) closest to the lettering in the posts. */
  fontPairId?: string;
  /** Whether on-image text sits on a pill or box background. */
  textBox?: "none" | "pill" | "box";
  /** Share (0-100) of the brand's images that show a person. */
  peoplePct?: number;
  /** How people appear: candid, posed, hands only, faces. */
  peopleStyle?: string;
  /** ~40 words of lighting, medium, colour mood and aesthetic with no subject. Appended to every image prompt. */
  promptSuffix: string;
}

/** Copywriting rules learned from the brand's real posts. */
export interface Playbook {
  /** Content pillars with their share of posts; shares add up to about 100. */
  pillars: { name: string; pct: number }[];
  adjectives: string[];
  neverSoundsLike: string;
  hookFormulas: string[];
  formatting: { avgWords: number; lineBreaks: string; emoji: string };
  cta: string;
  hashtagRule: string;
  blacklist: string[];
  /** Share of posts per post format id (FORMATS in lib/content/brief.ts), learned from the feed. */
  formatMix?: { format: string; pct: number }[];
  /** Share of the feed by post type, counted from the scraped posts (not by the model). */
  postTypeMix?: { image: number; carousel: number; video: number };
  /** Counted from the scraped posts (lib/social/stats.ts), not guessed by the model. */
  postStats?: PostStats;
  /** Captions of the best posts, used as few-shot style anchors. */
  anchors: string[];
}

export interface Expression {
  styleGuide?: StyleGuide;
  tokens: {
    color: {
      primary: ColorToken;
      secondary: ColorToken;
      accent: ColorToken;
      neutral: ColorToken;
    };
    font: {
      heading: FontToken;
      body: FontToken;
    };
  };
  typographyFeel: string;
  visualStyle: string;
  imageryStyle: string;
  logoUrl?: string;
  logoNotes?: string;
  /** Storage path of the logo in the `logos` bucket, when a copy was saved. */
  logoPath?: string;
  distinctiveAssets: string[];
  layoutKit?: LayoutKit;
  photos?: BrandPhoto[];
}

/** NN/g tone dimensions, each 0–100. 0 is the left word of the axis name, 100 the right. */
export interface Tone {
  funny_serious: number; // 0 funny … 100 serious
  formal_casual: number; // 0 formal … 100 casual
  respectful_irreverent: number; // 0 respectful … 100 irreverent
  enthusiastic_matter: number; // 0 enthusiastic … 100 matter-of-fact
}

export interface Voice {
  playbook?: Playbook;
  tone: Tone;
  /** Per-platform overrides of `tone`. Read through `effectiveTone` in scale.ts. */
  toneByPlatform?: Partial<Record<Platform, Partial<Tone>>>;
  description: string;
  vocabulary: { use: string[]; avoid: string[] };
  sampleLines: string[];
}

export interface Content {
  pillars: string[];
  categoryEntryPoints: string[];
  hashtagClusters: string[];
  do: string[];
  dont: string[];
  vibe: string[];
  productsServices: string[];
}

export type FieldSource = "extracted" | "inferred" | "user" | "generated";

/** How a field's value was produced. */
export type FieldMethod = "css" | "vision" | "llm" | "measured" | "rated" | "answers" | "user" | "default";

export interface FieldMeta {
  source: FieldSource;
  method?: FieldMethod;
  platform?: Platform;
  confidence: number; // 0–1
  /** Low/high bounds in the field's own units (0–100 for personality and tone). */
  interval?: [number, number];
  locked: boolean;
  /** Ids of `BrandModel.evidence` items this value rests on. */
  evidence: string[];
  /** Free-text reason, e.g. "website / image colours". */
  note?: string;
  /** The value as a machine last wrote it, to compare with later user corrections. */
  value?: unknown;
  updatedAt?: string;
}

export interface Evidence {
  /** Stable id: `${source}:${url ?? ""}`. See `evidenceId`. */
  id: string;
  source: "website" | "instagram" | "pdf" | "upload";
  url?: string;
  summary: string;
  colors?: string[];
  fonts?: string[];
  logoUrl?: string;
  copySample?: string;
  capturedAt: string;
}

export interface Measures {
  version: string;
  at: string;
  text: TextMeasures;
  rating?: { facets: RatingResult; textsRated: number; calls: number; failedCalls: number };
  /** Where the numbers disagree with the profile; rebuilt on every run. */
  contradictions?: Contradiction[];
  /** Colours measured from pixels: logo decides brand colours, photos only inform photography. */
  pixels?: { version: string; logoPalette: string[]; photoPalette: string[] };
}

export interface Compliance {
  minorsInAudience: boolean;
  restrictedTopics: string[];
}

export const evidenceId = (source: Evidence["source"], url?: string) => `${source}:${url ?? ""}`;

export interface BrandModel {
  id: string;
  /** Missing on models saved before 0–100 scales; `upgradeModel` fills it in. */
  schemaVersion?: number;
  name: string;
  mode: BrandMode;
  version: number;
  createdAt: string;
  updatedAt: string;
  strategy: Strategy;
  identity: Identity;
  personality: Personality;
  expression: Expression;
  voice: Voice;
  content: Content;
  /** Keyed by dotted field path, e.g. "expression.tokens.color.primary". */
  meta: Record<string, FieldMeta>;
  evidence: Evidence[];
  compliance: Compliance;
  /** Numbers measured from the site copy, with the method version they came from. */
  measures?: Measures;
}

export type LayerKey = "strategy" | "identity" | "personality" | "expression" | "voice" | "content";

/** Deep-partial helper for stage patches. */
export type DeepPartial<T> = T extends (infer U)[]
  ? U[]
  : T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export type ModelPatch = DeepPartial<Pick<BrandModel, LayerKey | "name">>;

const color = (hex: string): ColorToken => ({ $type: "color", $value: hex });
const font = (name: string): FontToken => ({ $type: "fontFamily", $value: name });

export function emptyModel(name: string, mode: BrandMode, id: string = crypto.randomUUID()): BrandModel {
  const now = new Date().toISOString();
  return {
    id,
    schemaVersion: MODEL_SCHEMA_VERSION,
    name,
    mode,
    version: 1,
    createdAt: now,
    updatedAt: now,
    strategy: {
      category: "",
      offering: "",
      audience: {
        ageGroups: [],
        markets: { countries: [], cityTiers: [] },
        languages: [],
        motivations: [],
        moments: [],
        psychographic: "",
      },
      problem: "",
      promise: "",
      differentiators: [],
      proofPoints: [],
      competitors: [],
    },
    identity: {
      prism: { physique: "", personality: "", culture: "", relationship: "", reflection: "", selfImage: "" },
      mission: "",
      oneLiner: "",
    },
    personality: { sincerity: 50, excitement: 50, competence: 50, sophistication: 50, ruggedness: 20 },
    expression: {
      tokens: {
        color: {
          primary: color("#1C1917"),
          secondary: color("#57534E"),
          accent: color("#D97706"),
          neutral: color("#F5F5F4"),
        },
        font: { heading: font("Inter"), body: font("Inter") },
      },
      typographyFeel: "",
      visualStyle: "",
      imageryStyle: "",
      distinctiveAssets: [],
    },
    voice: {
      tone: { funny_serious: 50, formal_casual: 50, respectful_irreverent: 30, enthusiastic_matter: 50 },
      description: "",
      vocabulary: { use: [], avoid: [] },
      sampleLines: [],
    },
    content: {
      pillars: [],
      categoryEntryPoints: [],
      hashtagClusters: [],
      do: [],
      dont: [],
      vibe: [],
      productsServices: [],
    },
    meta: {},
    evidence: [],
    compliance: { minorsInAudience: false, restrictedTopics: [] },
  };
}
