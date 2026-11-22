// Picks what a post will be BEFORE the model writes it: format, hook, pillar,
// entry point and moment. Rule-based (no LLM cost). The least recently used
// option wins, so consecutive posts differ in shape, not just in words.
import type { BrandModel, LayoutId, LayoutKit } from "@/lib/brand/model";
import { MOMENT_LABELS } from "@/lib/brand/audience";
import type { ProductRef, TemplateCategory } from "@/lib/types";
import type { ContentHistory } from "./history";

export interface PostFormat {
  id: string;
  label: string;
  /** How to write it. Sent to the model as a fixed instruction. */
  instruction: string;
  /** Templates this format suits. */
  templates: TemplateCategory[];
  /** Layouts that suit this format, best first. */
  layouts: LayoutId[];
  /** A real product photo suits it better than a generated scene. */
  usesProductPhoto?: boolean;
  /** Can be split into carousel slides. */
  carousel?: boolean;
  /** What the visual fields must contain. */
  visualText: string;
  /** Only used when asked for (never picked in normal rotation). */
  manual?: boolean;
  /** Needs real facts to write without inventing: used only when the request text or the brand profile supplies some. */
  requires?: Array<"request" | "proof" | "products">;
}

/** Products shown in one carousel: cover + one slide each + CTA = at most 10 slides. */
export const MAX_CAROUSEL_PRODUCTS = 8;

/** Splits a product list into carousels of at most MAX_CAROUSEL_PRODUCTS. */
export function chunkProducts<T>(list: T[], size = MAX_CAROUSEL_PRODUCTS): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export const PRODUCT_CAROUSEL: PostFormat = {
  id: "product-carousel",
  label: "Product carousel",
  instruction: "Show the brand's products one by one, so a reader can swipe through the range. Be specific about what each product is for.",
  templates: [],
  layouts: ["product-cover"],
  usesProductPhoto: true,
  carousel: true,
  manual: true,
  visualText: "headline = a cover line that names the range, max 8 words. subline = who it is for, max 10 words.",
};

export const FORMATS: PostFormat[] = [
  PRODUCT_CAROUSEL,
  {
    id: "myth-vs-fact",
    label: "Myth vs fact",
    instruction: "Name one common belief in this category, then correct it with the real fact and why it matters.",
    templates: ["educational", "engagement", "product_launch"],
    layouts: ["myth-fact", "split", "quote"],
    carousel: true,
    visualText: 'items = ["<the myth, max 10 words>", "<the fact, max 12 words>"]. headline = a short label like "Myth vs fact" in brand words.',
  },
  {
    id: "how-to",
    label: "How-to steps",
    instruction: "Teach one specific, useful thing in 3-5 short numbered steps. Concrete actions, no filler.",
    templates: ["educational", "product_launch", "behind_scenes"],
    layouts: ["checklist", "carousel-cover", "split"],
    carousel: true,
    visualText: "items = the steps, max 7 words each. headline = what they will be able to do.",
  },
  {
    id: "single-stat",
    label: "Single stat",
    requires: ["request", "proof"],
    instruction: "Build the post around ONE number that appears in the brand facts or the request. If there is none, do not use a number: lead with the single clearest fact instead.",
    templates: ["educational", "announcement", "testimonial", "product_launch"],
    layouts: ["big-number", "split"],
    visualText: 'stat = the number only (e.g. "3x", "72%", "10,000"). headline = what the number is about, max 8 words. Never invent precise statistics about third parties; if unsure, use a number about the brand itself.',
  },
  {
    id: "opinion",
    label: "Quote / opinion",
    instruction: "Take a clear, defensible point of view the brand believes. Say it plainly, then back it up in 2-3 sentences.",
    templates: ["engagement", "educational", "seasonal", "announcement"],
    layouts: ["quote", "full-bleed"],
    visualText: "headline = the opinion as a short quotable line, max 12 words. subline = who says it (the brand or founder).",
  },
  {
    id: "product-spotlight",
    label: "Product spotlight",
    requires: ["request", "products"],
    instruction: "Focus on one product or service from the brand facts: what it is and who it is for. Use only details given in the context; never invent specs, origins, ingredients or tasting notes.",
    templates: ["product_launch", "announcement", "ugc", "seasonal", "testimonial"],
    layouts: ["framed", "photo-band", "split", "full-bleed"],
    usesProductPhoto: true,
    visualText: "headline = the product's single best benefit, max 8 words. subline = the product name.",
  },
  {
    id: "before-after",
    label: "Before / after",
    instruction: "Contrast life before and after the product or idea. Make both sides concrete and recognisable.",
    templates: ["testimonial", "product_launch", "educational"],
    layouts: ["split", "myth-fact"],
    carousel: true,
    visualText: 'items = ["Before: <max 8 words>", "After: <max 8 words>"]. headline = the change, max 8 words.',
  },
  {
    id: "pov",
    label: "POV",
    instruction: 'Write from the reader\'s point of view in a relatable everyday moment (a "POV:" style setup), then land the brand naturally.',
    templates: ["engagement", "behind_scenes", "ugc", "seasonal"],
    layouts: ["full-bleed", "photo-band"],
    visualText: 'headline = the POV line, max 10 words (may start with "POV:").',
  },
  {
    id: "checklist",
    label: "Checklist",
    instruction: "Give a short checklist the reader can save: 3-5 items, each one line and specific.",
    templates: ["educational", "seasonal", "product_launch", "engagement"],
    layouts: ["checklist", "carousel-cover"],
    carousel: true,
    visualText: "items = the checklist items, max 6 words each. headline = what the checklist is for.",
  },
  {
    id: "customer-question",
    label: "Customer question",
    instruction: "Answer one question a buyer in this category would plausibly ask. Frame it as a question, never as something 'customers keep asking' or a quote from a real person. Answer only with facts from the context.",
    templates: ["engagement", "testimonial", "educational", "product_launch"],
    layouts: ["quote", "split"],
    visualText: "headline = the customer's question in their words, max 12 words. subline = a 5-8 word answer teaser.",
  },
  {
    id: "behind-the-scenes",
    label: "Behind the scenes",
    requires: ["request", "proof"],
    instruction: "Show one part of how the work gets done, using only steps, tools or places named in the context. Do not name or invent people. Process over polish.",
    templates: ["behind_scenes", "announcement", "ugc"],
    layouts: ["full-bleed", "photo-band", "framed"],
    visualText: "headline = what we are showing, max 8 words.",
  },
  {
    id: "comparison",
    label: "Comparison",
    instruction: "Compare two options the audience weighs up (not a named competitor). Be fair, then say who each is for.",
    templates: ["educational", "product_launch"],
    layouts: ["split", "myth-fact", "checklist"],
    carousel: true,
    visualText: 'items = ["<option A: max 8 words>", "<option B: max 8 words>"]. headline = the question being compared.',
  },
  {
    id: "mistake",
    label: "Mistake to avoid",
    instruction: "Name one common mistake the audience makes, why it happens, and the simple fix.",
    templates: ["educational", "engagement"],
    layouts: ["quote", "big-number", "checklist"],
    visualText: 'headline = the mistake, max 8 words. subline = the fix in max 8 words. stat may be "1" or a count if the post lists mistakes.',
  },
  {
    id: "mini-story",
    label: "Mini story",
    requires: ["request", "proof"],
    instruction: "Tell a 4-6 sentence everyday scene built only from the facts in the context. Do not name any person, place or customer, and do not present it as a real event. Start in the middle of the action. End with what changed.",
    templates: ["testimonial", "behind_scenes", "ugc", "announcement", "seasonal"],
    layouts: ["full-bleed", "photo-band", "quote"],
    visualText: "headline = the story's turning point in max 8 words.",
  },
  {
    id: "offer",
    label: "Offer",
    requires: ["request"],
    instruction: "Make one clear offer using ONLY the offer details in the request (what, until when, how). Never invent discounts, codes, deadlines, shipping or delivery terms. Short and specific, no hype words.",
    templates: ["product_launch", "seasonal", "announcement"],
    layouts: ["framed", "photo-band", "big-number"],
    usesProductPhoto: true,
    visualText: 'headline = the offer in max 6 words. stat = the deal if numeric (e.g. "20% off"). subline = the deadline or condition.',
  },
];

export interface HookStyle {
  id: string;
  instruction: string;
}

export const HOOKS: HookStyle[] = [
  { id: "question", instruction: "Open with a direct question the reader would answer yes to. Not 'Did you know'." },
  { id: "bold-claim", instruction: "Open with a short, confident statement (max 8 words) the brand can stand behind." },
  { id: "number", instruction: "Open with a number only if one appears in the context or request; otherwise open with a short, concrete fact." },
  { id: "contrarian", instruction: "Open by disagreeing with common advice in the category, then earn it." },
  { id: "story", instruction: "Open mid-scene with a concrete everyday moment from the reader's side. No named people, no setup sentence." },
  { id: "if-you", instruction: "Open with 'If you…' naming a specific situation the audience is in." },
];

/** The brand's own opening patterns when learned from its feed, else the generic list. */
export function learnedHooks(model?: BrandModel): HookStyle[] {
  const learned = (model?.voice.playbook?.hookFormulas ?? []).map((h) => h.trim()).filter(Boolean).slice(0, 6);
  if (!learned.length) return HOOKS;
  return learned.map((h, i) => ({ id: `learned-${i}`, instruction: `Open the way this brand's real posts do: ${h}` }));
}

/** Words that make captions read as AI-written. Merged with the brand's own "avoid" list. */
export const AI_CLICHES = [
  "elevate",
  "unlock",
  "unleash",
  "game-changer",
  "game changer",
  "in today's fast-paced world",
  "look no further",
  "dive into",
  "delve",
  "embark",
  "journey",
  "seamless",
  "revolutionize",
  "next level",
  "take it to the next level",
  "whether you're",
  "it's not just",
  "say goodbye to",
  "we've got you covered",
  "transform your",
  "empower",
  "curated",
  "Did you know?",
  "Ready to",
];

export interface PostBrief {
  format: PostFormat;
  hook: HookStyle;
  pillar?: string;
  entryPoint?: string;
  moment?: string;
  carousel: boolean;
  /** Product carousel only: the products, in slide order. */
  products?: ProductRef[];
}

/** Position in history (0 = newest) of the first post where `get` matches, or -1. */
function lastUsed(history: ContentHistory, get: (p: ContentHistory["posts"][number]) => string | undefined, value: string): number {
  return history.posts.findIndex((p) => get(p) === value);
}

/** Lower is better: never-used scores 0, used-in-the-last-post scores highest. */
function recencyScore(index: number, window: number): number {
  return index < 0 ? 0 : Math.max(window - index, 1);
}

function pickLeastRecent<T>(options: T[], score: (o: T) => number, rand: () => number): T | undefined {
  if (!options.length) return undefined;
  return options
    .map((o) => ({ o, s: score(o) + rand() * 0.5 }))
    .sort((a, b) => a.s - b.s)[0].o;
}

/**
 * Chooses the post's format, hook, pillar, entry point and moment from what was posted recently.
 * `rand` can be injected for tests.
 */
export function pickBrief(
  model: BrandModel | undefined,
  history: ContentHistory,
  template: TemplateCategory | undefined,
  opts: { allowCarousel?: boolean; rand?: () => number; products?: ProductRef[]; request?: string } = {}
): PostBrief {
  const rand = opts.rand ?? Math.random;
  const window = Math.max(history.posts.length, 6);
  const regular = FORMATS.filter((f) => !f.manual);
  const have = {
    request: !!opts.request && opts.request.trim().length > 20,
    proof: !!(model?.strategy.proofPoints.length || model?.strategy.differentiators.length),
    products: !!model?.content.productsServices.length,
  };
  const grounded = (f: PostFormat) => !f.requires || f.requires.some((r) => have[r]);
  const gated = regular.filter(grounded);
  const base = gated.length ? gated : regular;
  const fitting = template ? base.filter((f) => f.templates.includes(template)) : base;
  const pool = fitting.length ? fitting : base;
  const products = opts.products?.slice(0, MAX_CAROUSEL_PRODUCTS);

  // What the brand's real feed does: formats it posts, hooks it opens with, pillars it covers.
  const playbook = model?.voice.playbook;
  const mix = new Map((playbook?.formatMix ?? []).map((m) => [m.format, m.pct]));
  const format = products?.length ? PRODUCT_CAROUSEL : pickLeastRecent(
    pool,
    (f) => {
      const recency = recencyScore(lastUsed(history, (p) => p.format, f.id), window);
      const dislike = (history.dislikes.formats[f.id] ?? 0) * 3;
      // With a learned mix, favour the brand's own formats; recency still keeps posts from repeating.
      return mix.size ? recency * 1.2 + dislike - ((mix.get(f.id) ?? 0) / 100) * 10 + (mix.has(f.id) ? 0 : 3) : recency * 2 + dislike;
    },
    rand
  )!;

  // Never the same hook as either of the last two posts. The brand's own hook patterns replace the generic list.
  const recentHooks = history.posts.slice(0, 2).map((p) => p.hook);
  const allHooks = learnedHooks(model);
  const hookPool = allHooks.filter((h) => !recentHooks.includes(h.id));
  const hook = pickLeastRecent(hookPool.length ? hookPool : allHooks, (h) => recencyScore(lastUsed(history, (p) => p.hook, h.id), window), rand)!;

  const pillarShare = new Map((playbook?.pillars ?? []).map((p) => [p.name, p.pct]));
  const pillars = pillarShare.size ? Array.from(pillarShare.keys()) : model?.content.pillars ?? [];
  const pillar = pickLeastRecent(pillars, (x) => recencyScore(lastUsed(history, (p) => p.pillar, x), window) - ((pillarShare.get(x) ?? 0) / 100) * 6, rand);

  // Entry points and moments aren't stored per post; rotate by post count.
  const n = history.posts.length;
  const ceps = model?.content.categoryEntryPoints ?? [];
  const entryPoint = ceps.length ? ceps[(n + Math.floor(rand() * 2)) % ceps.length] : undefined;
  const moments = model?.strategy.audience.moments ?? [];
  const moment = moments.length ? MOMENT_LABELS[moments[n % moments.length]] : undefined;

  const recentCarousel = history.posts.slice(0, 2).some((p) => p.layout === "carousel-cover");
  if (products?.length) return { format, hook, pillar, entryPoint, moment, carousel: true, products };
  // A brand whose feed has no carousels should not get them; one that does gets them in proportion.
  const typeMix = playbook?.postTypeMix;
  // Lean toward whichever of carousel / single image earns more engagement on this brand's own feed (within 0.7x-1.4x).
  const eng = playbook?.postStats?.engagementByType;
  const lean = eng?.carousel && eng.image ? Math.min(1.4, Math.max(0.7, eng.carousel / eng.image)) : 1;
  const feedAllowsCarousel = !typeMix || rand() * 100 < Math.min(typeMix.carousel * 1.5 * lean, 100);
  const carousel = !!(opts.allowCarousel && format.carousel && !recentCarousel && feedAllowsCarousel);

  return { format, hook, pillar, entryPoint, moment, carousel };
}

/** The brief as fixed instructions for the model. */
export function briefBlock(b: PostBrief): string {
  return [
    `POST BRIEF (follow exactly, these are decisions, not suggestions):`,
    `- FORMAT: ${b.format.label}. ${b.format.instruction}`,
    `- HOOK: ${b.hook.instruction}`,
    b.pillar && `- CONTENT PILLAR: ${b.pillar}`,
    b.entryPoint && `- SITUATION TO TIE IT TO: ${b.entryPoint}`,
    b.moment && `- MOMENT: ${b.moment}`,
    `- VISUAL TEXT: ${b.format.visualText}`,
    b.products?.length
      ? [
          `- PRODUCTS (in this order):`,
          ...b.products.map((p, i) => `  ${i + 1}. ${p.name}${p.note ? ` (${p.note})` : ""}`),
          `- CAROUSEL: write "slides" with exactly ${b.products.length + 2} slides. Slide 1 is the cover: a headline (max 8 words) for the whole range. Slides 2-${b.products.length + 1} are the products in the order above: headline = the product name, body = ONE benefit, max 14 words, using only what the name and note say (no invented specs, prices or claims). The last slide's headline is the call to action (max 6 words).`,
        ].join("\n")
      : b.carousel
      ? `- CAROUSEL: write "slides" with 4-6 slides. Slide 1 is the cover (the headline). Each other slide has a headline (max 8 words) and an optional body (max 20 words).`
      : `- Single image post. "slides" must be an empty array.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Layout choice ──────────────────────────────────────────────────────────
const PHOTO_LAYOUTS: LayoutId[] = ["photo-band", "full-bleed", "split", "framed"];

/** Layouts only used for carousels; never offered in the kit or picked for normal posts. */
export const SPECIAL_LAYOUTS: LayoutId[] = ["carousel-cover", "carousel-slide", "product-cover", "product-slide"];

export function layoutNeedsPhoto(id: LayoutId): boolean {
  return PHOTO_LAYOUTS.includes(id) || id === "carousel-cover" || id === "product-cover";
}

const TEXT_LAYOUTS: LayoutId[] = ["quote", "checklist", "myth-fact", "big-number"];

/** Pushes text-card layouts down when the feed is mostly plain photos, and photo layouts down when it is mostly text cards. */
export function layoutPenalty(l: LayoutId, textOnImagePct?: number): number {
  if (textOnImagePct === undefined) return 0;
  const isText = TEXT_LAYOUTS.includes(l);
  if (textOnImagePct <= 25) return isText ? 3 : 0;
  if (textOnImagePct >= 60) return isText ? 0 : 1.5;
  return 0;
}

/**
 * Picks the visual layout: matches the format, only from the brand's kit, never the
 * same as either of the last two posts, fewer thumbs-down first.
 */
export function chooseLayout(
  kit: LayoutKit,
  formatId: string | undefined,
  history: ContentHistory,
  opts: { carousel?: boolean; product?: boolean; rand?: () => number; textOnImagePct?: number } = {}
): LayoutId {
  if (opts.product) return "product-cover";
  if (opts.carousel) return "carousel-cover";
  const rand = opts.rand ?? Math.random;
  const allowed: LayoutId[] = kit.layouts.filter((l) => !SPECIAL_LAYOUTS.includes(l));
  const format = FORMATS.find((f) => f.id === formatId);
  const recent = history.posts.slice(0, 2).map((p) => p.layout);
  const preferred = (format?.layouts ?? []).filter((l) => allowed.includes(l));
  const candidates = (preferred.length ? preferred : allowed).filter((l) => !recent.includes(l));
  const pool = candidates.length ? candidates : allowed.filter((l) => !recent.includes(l));
  const final = pool.length ? pool : allowed.length ? allowed : (["photo-band"] as LayoutId[]);
  return final
    .map((l, i) => ({ l, s: i + (history.dislikes.layouts[l] ?? 0) * 3 + layoutPenalty(l, opts.textOnImagePct) + rand() * 0.8 }))
    .sort((a, b) => a.s - b.s)[0].l;
}
