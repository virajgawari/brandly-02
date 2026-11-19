// One prompt builder for every post generator (composer, automation, n8n).
import { z } from "zod";
import type { BrandModel } from "@/lib/brand/model";
import { toPromptContext } from "@/lib/brand/projection";
import { GeneratedPostSchema } from "@/lib/brand/schemas";
import { CONTENT_TEMPLATES, PLATFORM_LIMITS } from "@/lib/templates";
import type { BrandDNA, CarouselSlide, GeneratedPost, Platform, ProductRef, TemplateCategory } from "@/lib/types";
import { AI_CLICHES, briefBlock, type PostBrief } from "./brief";
import { historyBlock, type ContentHistory } from "./history";
import { imagePromptFromBrief } from "./visual";

export const POST_PROMPT_VERSION = "generate-post@5";
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
}

export function buildPostPrompt(r: PostRequest): { system: string; user: string; brandContext: string } {
  const t = CONTENT_TEMPLATES.find((x) => x.id === r.template);
  const platforms = r.platforms.length ? r.platforms : (["instagram"] as Platform[]);
  const tags = r.model?.content.hashtagClusters ?? r.dna?.hashtag_clusters ?? [];
  const samples = r.model?.voice.sampleLines ?? [];
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
    `- No emoji as the first character. No "Did you know". No rhetorical triple lists ("X, Y and Z").`,
    `- Short paragraphs, one idea per post. Use ONLY details that appear in the brand context, topic or extra context above.`,
    `- Never invent facts: no made-up people, customers, places, estates, tasting notes, origins, ingredients, numbers, prices, discounts, promo codes, deadlines or shipping terms. If a detail is not given, write around it.`,
    `- The brand's do/don't rules (such as naming an origin) apply only where the facts exist; when they do not, skip the rule.`,
    businessLine(r.model) && `- ${businessLine(r.model)}`,
    samples.length && `- Match the rhythm of these brand lines: ${samples.slice(0, 3).map((s) => `"${s}"`).join(" ")}`,
    `- Write 2-3 sentences that could sit next to the brand's EXAMPLE LINES without standing out.`,
    `- Hashtags: 5-10, mostly from: ${tags.length ? tags.join(" ") : "niche tags for this category"}. Include the #.`,
    "",
    `Return JSON:
{
  "caption": "the main caption (Instagram style). Do NOT put hashtags or the call to action in it; they are separate fields",
  "hashtags": ["#tag", ...5-10],
  "cta": "one clear call to action sentence",
  "headline": "max 8 words, for the image",
  "subline": "max 12 words, supports the headline (can be empty)",
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
  "bestTimeToPost": "e.g. Tue-Thu 7-9pm",
  "postType": "exactly one of: Single image, Carousel, Reel, Story",
  "platformVariants": { ${platforms.map((p) => `"${p}": "..."`).join(", ")} }
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
    if (p.hashtags.length < 5) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["hashtags"], message: `provide 5-10 hashtags, you gave ${p.hashtags.length}` });
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
export function finalizePost(raw: unknown, r: Pick<PostRequest, "model" | "dna" | "brief" | "platforms">): GeneratedPost | null {
  const parsed = GeneratedPostSchema.safeParse(raw);
  const loose = (raw ?? {}) as Partial<GeneratedPost>;
  if (!parsed.success && !loose.caption) return null;
  const p = parsed.success ? parsed.data : null;
  const visualBrief = p?.visualBrief ?? loose.visualBrief;
  const usesProductPhoto = !!(visualBrief?.usesProductPhoto || r.brief.format.usesProductPhoto);
  const vb = visualBrief ? { ...visualBrief, usesProductPhoto } : undefined;
  const headline = p?.headline ?? loose.headline ?? loose.caption!.split(/[.!?\n]/)[0].split(/\s+/).slice(0, 8).join(" ");
  const variants = (p?.platformVariants ?? loose.platformVariants ?? {}) as Record<string, string>;
  const cta = p?.cta ?? loose.cta ?? "";
  const written = p?.slides ?? loose.slides ?? [];
  return {
    caption: cleanCaption(p?.caption ?? loose.caption!, cta),
    hashtags: dedupeTags(p?.hashtags ?? (loose.hashtags ?? []).slice(0, 10)),
    cta,
    bestTimeToPost: p?.bestTimeToPost || loose.bestTimeToPost || "",
    postType: r.brief.carousel ? "Carousel" : cleanPostType(p?.postType || loose.postType),
    platformVariants: Object.fromEntries(Object.entries(variants).filter(([k, v]) => (r.platforms as string[]).includes(k) && typeof v === "string" && v.trim() !== "" && !/^(same as|see|identical to|as above)/i.test(v.trim()))),
    imagePrompt: imagePromptFromBrief(vb, r.model, r.dna, loose.imagePrompt ?? headline),
    format: r.brief.format.id,
    hook: r.brief.hook.id,
    pillar: r.brief.pillar,
    headline,
    subline: p?.subline ?? loose.subline ?? "",
    items: p?.items ?? loose.items ?? [],
    stat: p?.stat ?? loose.stat ?? "",
    slides: r.brief.products?.length ? productSlides(r.brief.products, written, headline, cta) : r.brief.carousel ? written : [],
    visualBrief: vb,
  };
}
