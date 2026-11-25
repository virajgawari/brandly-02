// Art-director step: turns the brand model, its best past posts and the finished copy into one
// rich image prompt. Runs after the copy is written; any failure falls back to imagePromptFromBrief.
import { z } from "zod";
import type { BrandModel } from "@/lib/brand/model";
import { paletteToWords } from "@/lib/brand/color";
import type { BrandDNA, GeneratedPost } from "@/lib/types";

export const ART_DIRECTOR_VERSION = "art-director@1";

export const ART_DIRECTOR_SYSTEM = `You are a Senior Brand Art Director and Commercial Visual Designer. You synthesize a brand's identity, its highest-performing past Instagram posts and a copy brief into one richly detailed image generation prompt.

INPUTS: BRAND_MODEL (name, industry, vibe, exact palette with hex codes, typography style, signature motifs/products, visual prohibitions), PAST_TOP_POSTS (what the best posts looked like and how they did), TEXT_CONTENT (the exact headline, subheadline, supporting info and CTA).

DIRECTIVES
1. ELEVATE PAST WINNERS, DO NOT COPY FLAWS: work out why the top posts worked (relatable human subject, high-contrast split layout, bold data callout). Keep that structural archetype and subject appeal, but lift the execution to agency-grade editorial photography and graphic design: better light, intentional grid alignment, richer texture, zero clutter.
2. EXPLICIT SCENE AND CHARACTER DIRECTION: never write "a happy person using a laptop". Give demographics, authentic expression, wardrobe in the brand palette, natural pose, lens and framing (for example 50mm medium shot, eye level), environment depth and lighting mood. If the brand does not show people, direct a product or object scene with the same precision.
3. BRAND GROUNDING: use concrete brand artifacts from the model: real product silhouettes, signature materials, recurring motifs, environment cues of its niche. Never invent products the brand does not have.
4. TYPOGRAPHY AND LAYOUT: quote the exact wording of every text layer. Give font style, text colour, alignment and background treatment (for example a semi-transparent dark frosted card) so the text is clearly legible. Reserve clean negative space so text never sits on faces or busy texture.
5. PALETTE: name colours with evocative names and hex values (for example "deep forest green #1B4332"), balanced 60% dominant, 30% secondary, 10% accent.

IMPORTANT: the text layers are added later by the design system, never by the image model. In compiled_image_prompt describe only the clean, empty zone reserved for text (and the tone it needs, for example a calm dark area behind it); do NOT ask the image model to draw a card, box, caption or any lettering. Put the typography detail (font style, colour, alignment, box) only in layout_archetype. negative_space_zone must agree with the subject placement: if text goes left, the subject sits right, and never centre the subject.

Do not invent facts, numbers, product names or text beyond TEXT_CONTENT and BRAND_MODEL.

OUTPUT: strict JSON with exactly these keys:
{
  "inspired_by_post_id": "id of the past post whose archetype you built on, or empty string",
  "layout_archetype": "string",
  "negative_space_zone": "string, for example left 45% of frame, top third",
  "compiled_image_prompt": "one cohesive 140-200 word prompt combining Scene, Characters, Brand Elements, Palette, Lighting, Typography and Layout",
  "overlay_text_layers": { "headline": "", "subhead": "", "supporting_bullets": [""], "cta": "" },
  "negative_prompt": "elements to exclude: distorted text, extra fingers, cluttered background, low-res stock look, watermark"
}`;

export const ArtDirectionSchema = z.object({
  inspired_by_post_id: z.string().default(""),
  layout_archetype: z.string().min(1),
  negative_space_zone: z.string().min(1),
  compiled_image_prompt: z.string().min(80),
  overlay_text_layers: z.object({
    headline: z.string().default(""),
    subhead: z.string().default(""),
    supporting_bullets: z.array(z.string()).default([]),
    cta: z.string().default(""),
  }),
  negative_prompt: z.string().default(""),
});
export type ArtDirection = z.infer<typeof ArtDirectionSchema>;

export interface TopPostRef {
  id: string;
  caption: string;
  /** Engagement summary, for example "1.2k likes, 48 comments". Optional. */
  metrics?: string;
  kind?: string;
}

/** The user message: brand model, past winners, copy. Compact on purpose (the free LLM quota is small). */
export function buildArtDirectorUser(args: { post: GeneratedPost; model?: BrandModel; dna?: BrandDNA; topPosts: TopPostRef[]; brandName?: string }): string {
  const { post, model, dna, topPosts } = args;
  const c = model?.expression.tokens.color;
  const hexes = c ? [c.primary.$value, c.secondary.$value, c.accent.$value] : dna ? [dna.colors.primary, dna.colors.secondary, dna.colors.accent] : [];
  const roles = ["Primary", "Secondary", "Accent"];
  const guide = model?.expression.styleGuide;
  const tokens = model?.expression.tokens;
  const brand = {
    name: args.brandName ?? model?.name ?? dna?.brandName ?? "",
    industry: model?.strategy?.industry ?? model?.strategy?.category ?? "",
    vibe: (model?.content.vibe ?? dna?.vibe ?? []).slice(0, 4),
    palette: hexes.map((h, i) => `${roles[i]}: ${h} (${paletteToWords([h])[0] ?? "colour"})`),
    typography: [guide?.typography, tokens ? `heading ${tokens.font?.heading?.$value ?? ""}, body ${tokens.font?.body?.$value ?? ""}` : ""].filter(Boolean).join("; "),
    textStyle: { colour: guide?.textColor, box: guide?.textBox },
    imagery: model?.expression.imageryStyle || guide?.medium || dna?.visual_style || "",
    motifs: (model?.expression.distinctiveAssets ?? []).slice(0, 4),
    people: guide?.peoplePct === undefined ? "unknown" : `${guide.peoplePct}% of posts show people (${guide.peopleStyle || "candid"})`,
    stylePromptSuffix: guide?.promptSuffix ?? "",
    prohibitions: ["no text or logos inside the photo (text is added in a separate layer)"],
  };
  const visual = post.visualBrief;
  return [
    `BRAND_MODEL:\n${JSON.stringify(brand, null, 2)}`,
    `PAST_TOP_POSTS:\n${topPosts.length ? topPosts.map((p) => `- id ${p.id}${p.kind ? ` (${p.kind})` : ""}${p.metrics ? ` [${p.metrics}]` : ""}: "${p.caption.slice(0, 220)}"`).join("\n") : "- none available; infer the archetype from the brand model"}`,
    `TEXT_CONTENT:\n${JSON.stringify({ headline: post.headline ?? "", subhead: post.subline ?? "", supporting_bullets: post.items ?? (post.stat ? [post.stat] : []), cta: post.cta }, null, 2)}`,
    visual && `SCENE HINT FROM THE COPYWRITER (keep the idea, upgrade the execution): ${[visual.subject, visual.setting, visual.lighting, visual.composition].filter(Boolean).join("; ")}${visual.usesProductPhoto ? ". A real product photo is used, so direct the surrounding frame and light, not a new product." : ""}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Drop sentences that ask the image model to draw an overlay card/box/panel (text is composited later). */
export function stripTextCardSentences(prompt: string): string {
  const sentences = prompt.match(/[^.!?]+[.!?]*/g) ?? [prompt];
  const kept = sentences.filter((s) => !/\b(overlay|card|text box|panel)\b/i.test(s));
  return kept.length ? kept.join("").trim() : prompt;
}

/** Image-model prompt from a validated art direction: the compiled prompt plus layout and exclusions. */
export function imagePromptFromDirection(d: ArtDirection): string {
  return [
    stripTextCardSentences(d.compiled_image_prompt).trim(),
    // layout_archetype is typography detail for the overlay layer (and small models bloat it), so only the zone goes to the image model.
    `Keep ${d.negative_space_zone.slice(0, 120)} clean and calm, with no card, box or panel drawn there.`,
    "Photograph only: do not render any text, letters, numbers, logos or watermarks in the image.",
    d.negative_prompt && `Avoid: ${d.negative_prompt}.`,
  ]
    .filter(Boolean)
    .join(" ");
}
