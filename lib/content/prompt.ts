// One prompt builder for every post generator (composer, automation, n8n).
import { bestTimeLabel } from "@/lib/social/stats";
import { z } from "zod";
import type { BrandModel, LayoutId, Playbook } from "@/lib/brand/model";
import { toPromptContext } from "@/lib/brand/projection";
import { GeneratedPostSchema } from "@/lib/brand/schemas";
import { CONTENT_TEMPLATES, PLATFORM_LIMITS } from "@/lib/templates";
import type { BrandDNA, CarouselSlide, GeneratedPost, Platform, ProductRef, TemplateCategory } from "@/lib/types";
import { AI_CLICHES, briefBlock, type PostBrief } from "./brief";
import { historyBlock, type ContentHistory } from "./history";
import { hashtagRange, rangeText } from "./hashtags";
import { imagePromptFromBrief } from "./visual";
import { ART_JSON, artSection, artBrandBlock, artFromPost, imagePromptFromDirection, layoutLock, type TopPostRef } from "./artdirect";

export const POST_PROMPT_VERSION = "generate-post@9";

/** Ad-copy budgets: display-scale headlines, short sublines. */
export const MAX_HEADLINE = 52;
export const MAX_SUBLINE = 85;

/** Cuts at a word boundary. Keeps *emphasis* markers balanced. */
export function clipCopy(text: string, max: number): string {
  const plain = text.replace(/\*/g, "");
  if (plain.length <= max) return text.trim();
  const cut = plain.slice(0, max).replace(/\s+\S*$/, "").replace(/[,;:\s-]+$/, "");
  return cut || plain.slice(0, max);
}
/** Higher than the default 0.7: posts should vary, brand facts come from the context. */
export const POST_TEMPERATURE = 0.9;

export const POST_SYSTEM = `You are a senior social media copywriter for one brand.
You write posts that sound like the brand's own people wrote them: specific, concrete, plain words.
You follow the POST BRIEF exactly. You never sound like generic AI marketing copy.
Use only facts that appear in the brand context or the request. Never invent people, customer quotes, numbers, brew or process times, quantities, limited runs, product names, prices, dates or awards. When a detail is missing, write around it instead of making one up.`;

export function brandContextOf(model?: BrandModel, dna?: BrandDNA): string {
  return model ? toPromptContext(model) : `Brand DNA:\n${JSON.stringify(dna ?? {}, null, 2)}`;
}

export function bannedWords(model?: BrandModel): string[] {
  return [...new Set([...AI_CLICHES, ...(model?.voice.vocabulary.avoid ?? [])].map((w) => w.trim()).filter(Boolean))];
}

import { businessLine } from "@/lib/brand/business";

export interface PostRequest {
  model?: BrandModel;
  dna?: BrandDNA;
  brief: PostBrief;
  history: ContentHistory;
  platforms: Platform[];
  template?: TemplateCategory;
  topic?: string;
  tone?: string;
  additionalContext?: string;
  /** Automation: what triggered the post (RSS item, product page…). */
  triggerContext?: string;
  /** Captions of the brand's real top posts in the format being made. */
  formatExamples?: { kind: "image" | "carousel"; matched: boolean; captions: string[] };
  /** Closed list of real product names the post may mention. */
  catalog?: string[];
  /** Layout chosen before the image is described, so the photo leaves room where the text goes. */
  layout?: LayoutId;
  /** The brand's best scraped posts, with what their photos show. */
  topPosts?: TopPostRef[];
}

/** What the brand's real feed does, as writing rules. Empty when nothing was learned. */
export function feedRules(playbook?: Playbook): string[] {
  if (!playbook) return [];
  const f = playbook.formatting;
  const st = playbook.postStats;
  const out = [
    f?.avgWords ? `- Length: about ${f.avgWords} words in the caption (the brand's real average).` : "",
    f?.lineBreaks ? `- Line breaks and sentences: ${f.lineBreaks}` : "",
    f?.emoji ? `- Emoji: ${f.emoji}` : "",
    playbook.cta ? `- Closing: ${playbook.cta}` : "",
    playbook.neverSoundsLike ? `- Never sound like: ${playbook.neverSoundsLike}` : "",
    playbook.adjectives?.length ? `- Sounds: ${playbook.adjectives.slice(0, 5).join(", ")}.` : "",
    st?.hashtags?.top?.length ? `- Hashtags it reuses: ${st.hashtags.top.slice(0, 6).join(" ")}.` : "",
    st?.words && st.sampleSize >= 8 ? `- Its ${st.bestLength}-caption posts get the most engagement (${st.words.p25}-${st.words.p75} words is its usual range).` : "",
  ].filter(Boolean);
  return out.length ? [`THE BRAND'S OWN HABITS (learned from its real posts; they outrank generic style advice):`, ...out] : [];
}

export function buildPostPrompt(r: PostRequest): { system: string; user: string; brandContext: string } {
  const t = CONTENT_TEMPLATES.find((x) => x.id === r.template);
  const platforms = r.platforms.length ? r.platforms : (["instagram"] as Platform[]);
  const tags = r.model?.content.hashtagClusters ?? r.dna?.hashtag_clusters ?? [];
  const tagRange = hashtagRange(r.model);
  const samples = r.model?.voice.sampleLines ?? [];
  const playbook = r.model?.voice.playbook;
  const fx = r.formatExamples;
  const anchors = (fx?.captions.length ? fx.captions : (playbook?.anchors ?? [])).slice(0, 5);
  const anchorLabel = fx?.matched ? `real top ${fx.kind === "carousel" ? "carousel" : "single-image"} posts by this brand` : "real top posts by this brand";
  const withArt = !r.brief.products?.length && process.env.ART_DIRECTOR !== "off";
  const user = [
    briefBlock(r.brief),
    "",
    `REQUEST:`,
    t && `- Template: ${t.label} (${t.promptHint})`,
    `- Topic: ${r.topic || "choose a specific angle within the content pillar"}`,
    r.triggerContext && `- Trigger: ${r.triggerContext}`,
    `- Platforms: ${platforms.map((p) => `${p} (max ${PLATFORM_LIMITS[p].caption} chars)`).join(", ")}`,
    r.tone && `- Tone override: ${r.tone}`,
    r.additionalContext && `- Extra context: ${r.additionalContext}`,
    "",
    historyBlock(r.history),
    "",
    `WRITING RULES:`,
    `- Never use these words or phrases: ${bannedWords(r.model).join(", ")}.`,
    `- No emoji as the first character. No "Did you know".${playbook ? "" : ' No rhetorical triple lists ("X, Y and Z").'}`,
    !playbook && `- Short paragraphs, one idea per post.`,
    `- Use ONLY details that appear in the brand context, topic or extra context above.`,
    `- Never invent facts: no made-up people, customers, places, estates, tasting notes, origins, ingredients, numbers, prices, discounts, promo codes, deadlines or shipping terms. If a detail is not given, write around it.`,
    `- The brand's do/don't rules (such as naming an origin) apply only where the facts exist; when they do not, skip the rule.`,
    `VERIFIED CATALOG (the only product names, models or collections you may name, in copy and image prompt): ${r.catalog?.length ? r.catalog.join("; ") : "none"}.`,
    `- Never write the brand name followed by a product, model or collection name that is not in VERIFIED CATALOG. Otherwise describe the product category in plain words.`,
    withArt && artSection(r.layout),
    withArt && artBrandBlock({ model: r.model, dna: r.dna, topPosts: r.topPosts }),
    businessLine(r.model) && `- ${businessLine(r.model)}`,
    ...(anchors.length
      ? [
          `STYLE ANCHORS (${anchorLabel}; match their exact rhythm, spacing and tone):`,
          ...anchors.map((a, i) => `Example ${i + 1}: "${a}"`),
          `- Match the average word count and line-break structure of the examples. Use emoji only at the density the examples use. Do not sound more enthusiastic or salesy than they do.`,
          ...feedRules(playbook),
        ]
      : [
          samples.length && `- Match the rhythm of these brand lines: ${samples.slice(0, 3).map((s) => `"${s}"`).join(" ")}`,
          `- Write 2-3 sentences that could sit next to the brand's EXAMPLE LINES without standing out.`,
          ...feedRules(playbook),
        ]),
    tagRange.max === 0
      ? `- Hashtags: none. Return an empty hashtags array.`
      : `- Hashtags: ${rangeText(tagRange)}${r.model?.voice.playbook?.hashtagRule ? ` (the brand's rule: ${r.model.voice.playbook.hashtagRule})` : ""}, mostly from: ${tags.length ? tags.join(" ") : "niche tags for this category"}. Include the #.`,
    "",
    `Return JSON:
{
  "caption": "the main caption (Instagram style). Do NOT put hashtags or the call to action in it; they are separate fields",
  "hashtags": ["#tag", ...${rangeText(tagRange)} tags],
  "cta": "one clear call to action sentence",
  "headline": "4-7 words, max ${MAX_HEADLINE} characters, display copy for the image. Wrap the 1-2 most important words in *asterisks*",
  "subline": "max ${MAX_SUBLINE} characters, supports the headline (can be empty)",
  "items": ["short lines, only if the brief's VISUAL TEXT asks for items"],
  "stat": "a number only, if the brief asks for one, else empty",
  "slides": [{ "headline": "...", "body": "..." }],
  "visualBrief": {
    "subject": "what the photo shows, concrete",
    "setting": "where",
    "lighting": "light quality",
    "composition": "framing, where empty space is",
    "usesProductPhoto": true if a real photo of the product would suit better than a staged scene
  },
  ${withArt ? ART_JSON + "\n  " : ""}"bestTimeToPost": "e.g. Tue-Thu 7-9pm",
  "postType": "exactly one of: Single image, Carousel, Reel, Story",
  "platformVariants": { ${platforms.map((p) => `"${p}": "the full caption written for ${p}"`).join(", ")} }
}
platformVariants: only ${platforms.join(", ")}. facebook = more conversational, no hashtags; linkedin = insight-led, max 3 hashtags; twitter = under 280 chars total.`,
  ]
    .filter((x): x is string => typeof x === "string")
    .join("\n");
  return { system: POST_SYSTEM, user, brandContext: brandContextOf(r.model, r.dna) };
}

/** One revise pass: the same brief and brand context, plus the post and what was wrong with it. */
export function buildRevisePrompt(user: string, post: GeneratedPost, failures: string[]): string {
  const keep = { caption: post.caption, hashtags: post.hashtags, cta: post.cta, headline: post.headline, subline: post.subline, platformVariants: post.platformVariants };
  return [
    user,
    "",
    "REVISE THIS POST:",
    JSON.stringify(keep, null, 2),
    "",
    "It failed these checks:",
    ...failures.map((f) => `- ${f}`),
    "",
    "Rewrite it so every check passes. Keep the same idea, brief and JSON shape. Fix only what failed; do not add new claims.",
  ].join("\n");
}

/** Schema that also rejects captions containing banned phrases (so the retry fixes them). */
export function postSchemaFor(model?: BrandModel) {
  const banned = bannedWords(model).map((w) => w.toLowerCase());
  return GeneratedPostSchema.superRefine((p, ctx) => {
    const range = hashtagRange(model);
    if (p.hashtags.length < range.min) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["hashtags"], message: `provide ${rangeText(range)} hashtags, you gave ${p.hashtags.length}` });
    const text = `${p.caption} ${p.headline}`.toLowerCase();
    const hits = banned.filter((w) => w.length > 3 && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
    if (hits.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["caption"], message: `remove the banned phrases: ${hits.join(", ")}` });
  });
}

/**
 * Product carousel: always cover + one slide per product + CTA. The model's order is never trusted:
 * product names and photos come from the request, and its text is used only when it lines up.
 */
export function productSlides(products: ProductRef[], written: CarouselSlide[], headline: string, cta: string): CarouselSlide[] {
  const full = written.length === products.length + 2;
  return [
    { headline: written[0]?.headline?.trim() || headline },
    ...products.map((p, i) => ({
      headline: p.name,
      body: (full ? written[i + 1]?.body?.trim() : "") || p.note || "",
      photoPath: p.path,
    })),
    { headline: (full ? written[products.length + 1]?.headline?.trim() : "") || cta || "See the range" },
  ];
}

const POST_TYPES = ["Single image", "Carousel", "Reel", "Story"];

/** Keeps postType to one real value; the model sometimes echoes the whole option list. */
export function cleanPostType(v?: string): string {
  const t = (v ?? "").trim();
  return POST_TYPES.find((x) => x.toLowerCase() === t.toLowerCase()) ?? "Single image";
}

/** A variant that points elsewhere or repeats the instructions ("Caption with hashtags and CTA, 2200 char limit") instead of being a caption. */
export function isLazyVariant(v: string): boolean {
  const t = v.trim();
  return /^(same as|see|identical to|as above)\b/i.test(t) || /^caption with\b/i.test(t) || /\bchar(acter)?s? limit\b/i.test(t) || /^the full caption written for\b/i.test(t);
}

/** Removes inline hashtags and a repeated CTA from caption text; both are shown separately. */
export function cleanCaption(text: string, cta: string): string {
  let out = text.replace(/(?:\s*#[\p{L}\p{N}_]+)+\s*$/u, "").trim();
  const c = cta.trim();
  if (c && out.toLowerCase().endsWith(c.toLowerCase())) out = out.slice(0, out.length - c.length).trim();
  return out;
}

/** Removes repeated hashtags, ignoring case. */
export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((t) => {
    const k = t.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Normalises a model reply (validated or raw from n8n) into a GeneratedPost with brief metadata attached. */
export function finalizePost(raw: unknown, r: Pick<PostRequest, "model" | "dna" | "brief" | "platforms" | "layout">): GeneratedPost | null {
  const parsed = GeneratedPostSchema.safeParse(raw);
  const loose = (raw ?? {}) as Partial<GeneratedPost>;
  if (!parsed.success && !loose.caption) return null;
  const p = parsed.success ? parsed.data : null;
  const visualBrief = p?.visualBrief ?? loose.visualBrief;
  const usesProductPhoto = !!(visualBrief?.usesProductPhoto || r.brief.format.usesProductPhoto);
  const vb = visualBrief ? { ...visualBrief, usesProductPhoto } : undefined;
  const headline = clipCopy(p?.headline ?? loose.headline ?? loose.caption!.split(/[.!?\n]/)[0].split(/\s+/).slice(0, 8).join(" "), MAX_HEADLINE);
  const variants = (p?.platformVariants ?? loose.platformVariants ?? {}) as Record<string, string>;
  const cta = p?.cta ?? loose.cta ?? "";
  const written = p?.slides ?? loose.slides ?? [];
  const subline = clipCopy(p?.subline ?? loose.subline ?? "", MAX_SUBLINE);
  const items = p?.items ?? loose.items ?? [];
  const art = r.brief.products?.length ? null : artFromPost(p?.art ?? (loose as { art?: unknown }).art, { headline, subline, items, cta }, r.layout ? layoutLock(r.layout).zone : undefined);
  return {
    artDirection: art ?? undefined,
    caption: cleanCaption(p?.caption ?? loose.caption!, cta),
    // Never show more tags than the brand's playbook allows, even if the model over-delivers.
    hashtags: dedupeTags(p?.hashtags ?? (loose.hashtags ?? []).slice(0, 10)).slice(0, hashtagRange(r.model).max),
    cta,
    bestTimeToPost: bestTimeLabel(r.model?.voice.playbook?.postStats) || p?.bestTimeToPost || loose.bestTimeToPost || "",
    postType: r.brief.carousel ? "Carousel" : cleanPostType(p?.postType || loose.postType),
    platformVariants: Object.fromEntries(Object.entries(variants).filter(([k, v]) => (r.platforms as string[]).includes(k) && typeof v === "string" && v.trim() !== "" && !isLazyVariant(v))),
    imagePrompt: art ? imagePromptFromDirection(art) : imagePromptFromBrief(vb, r.model, r.dna, loose.imagePrompt ?? headline),
    format: r.brief.format.id,
    hook: r.brief.hook.id,
    pillar: r.brief.pillar,
    headline,
    subline,
    items,
    stat: p?.stat ?? loose.stat ?? "",
    slides: r.brief.products?.length ? productSlides(r.brief.products, written, headline, cta) : r.brief.carousel ? written : [],
    visualBrief: vb,
  };
}
