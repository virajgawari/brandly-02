// Art direction, written in the same LLM call as the copy (so it sees the same verified catalog and cannot
// amplify an invented product name). Any failure falls back to imagePromptFromBrief.
import { z } from "zod";
import type { BrandModel, LayoutId } from "@/lib/brand/model";
import { describeAudience } from "@/lib/brand/audience";
import { paletteToWords } from "@/lib/brand/color";
import type { BrandDNA } from "@/lib/types";

/** Where the text lands for each layout, and what that means for the photo. The layout is chosen BEFORE the photo is described. */
const FULL_BLEED_ZONE = "lower 40% of the frame";
const OUTSIDE_ZONE = "none: the text sits in a separate panel outside the photo";

export function layoutLock(layout?: LayoutId): { zone: string; directive: string } {
  switch (layout) {
    case "full-bleed":
    case "photo-band":
      return {
        zone: FULL_BLEED_ZONE,
        directive: `Subject sits in the upper-centre 60% of the frame. The ${FULL_BLEED_ZONE} must be clean, uncluttered negative space with soft out-of-focus depth, because the headline is placed there.`,
      };
    case "split":
    case "framed":
      return {
        zone: OUTSIDE_ZONE,
        directive: "Full-frame, balanced editorial photograph with clean margins. Text goes in a separate panel outside the photo, so compose the subject centrally and do not leave an empty zone.",
      };
    default:
      return {
        zone: FULL_BLEED_ZONE,
        directive: `Keep the ${FULL_BLEED_ZONE} calm and uncluttered; the subject sits in the upper-centre of the frame.`,
      };
  }
}

/** The art-direction instructions, appended to the copywriter prompt so one call writes copy and image prompt together. */
export function artSection(layout?: LayoutId): string {
  const lock = layoutLock(layout);
  return `ART DIRECTION (also fill the "art" object; this is the image prompt for the photo behind the text):
- LAYOUT LOCK (already decided, do not change): ${lock.directive}
- Build on the archetype of the TOP POSTS / STYLE ANCHORS (why they worked, which visual subjects win), but lift the execution to agency-grade editorial photography: better light, depth, zero clutter.
- Direct the scene precisely: who appears (match the AUDIENCE), expression, wardrobe, natural pose, lens and framing (for example 50mm medium shot, eye level), environment, lighting mood. If the brand does not show people, direct a product or object scene with the same precision.
- Use only real products from VERIFIED CATALOG; otherwise show the product category generically. Never invent a product, model name or logo.
- Describe colour in photographic language only (materials, surfaces, wardrobe, props, light) using the colour words and SURFACE in the ART BRAND block. NEVER write hex codes or "#" values in compiled_image_prompt.
- The headline, subline and CTA are added later by the design system, never drawn by the image model. Do NOT ask for a card, box, caption or lettering.`;
}

export const ART_SECTION = artSection();

export const ART_JSON = `"art": {
    "inspired_by_post_id": "id of the TOP POST whose visual archetype you built on, or empty string",
    "layout_archetype": "short, for example split layout, subject right",
    "compiled_image_prompt": "one cohesive 140-200 word photo prompt: scene, characters, brand props and surfaces, colour in words (no hex), lighting, and the clean text zone from the LAYOUT LOCK",
    "negative_prompt": "distorted text, extra fingers, cluttered background, low-res stock look, watermark"
  },`;

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
  /** Engagement score from the scrape. Optional. */
  engagement?: number;
  /** Engagement summary, for example "1.2k likes, 48 comments". Optional. */
  metrics?: string;
  kind?: string;
  /** What the photo shows, from the brand's vision tags (subject, setting, style). */
  visualTags?: string[];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, "")}…` : s);

/** Compact brand visual facts for the art-direction part of the prompt (colour words, surfaces, motifs, people, audience). */
export function artBrandBlock(args: { model?: BrandModel; dna?: BrandDNA; brandName?: string; topPosts?: TopPostRef[] }): string {
  const { model, dna } = args;
  const c = model?.expression.tokens.color;
  const hexes = c ? [c.primary.$value, c.secondary.$value, c.accent.$value] : dna ? [dna.colors.primary, dna.colors.secondary, dna.colors.accent] : [];
  const roles = ["Dominant (60%)", "Secondary (30%)", "Accent (10%)"];
  const guide = model?.expression.styleGuide;
  const tokens = model?.expression.tokens;
  const neutral = c?.neutral?.$value;
  // Tags the vision model wrote for the brand's own photos: the props, settings and looks it already uses.
  const photoTags = (model?.expression.photos ?? [])
    .flatMap((p) => p.tags ?? [])
    .flatMap((t) => [t.subject, t.setting, t.style])
    .filter(Boolean);
  const motifs = [...new Set([...(model?.expression.distinctiveAssets ?? []), ...photoTags])].slice(0, 8);
  const brand = {
    name: args.brandName ?? model?.name ?? dna?.brandName ?? "",
    industry: model?.strategy?.industry ?? model?.strategy?.category ?? "",
    audience: model?.strategy?.audience ? describeAudience(model.strategy.audience) : dna?.target_audience ?? "",
    vibe: (model?.content.vibe ?? dna?.vibe ?? []).slice(0, 4),
    // Words, never hex: image models treat "#C1440E" as noise.
    colours: hexes.map((h, i) => `${roles[i]}: ${paletteToWords([h])[0] ?? "colour"}`),
    surface: neutral ? `${paletteToWords([neutral])[0] ?? "neutral"} (use for backdrops, tabletops, walls)` : "",
    typography: [guide?.typography, tokens ? `heading ${tokens.font?.heading?.$value ?? ""}, body ${tokens.font?.body?.$value ?? ""}` : ""].filter(Boolean).join("; "),
    imagery: model?.expression.imageryStyle || guide?.medium || dna?.visual_style || "",
    composition: guide?.composition ?? "",
    motifs,
    people: guide?.peoplePct === undefined ? "unknown" : `${guide.peoplePct}% of posts show people (${guide.peopleStyle || "candid"})`,
    stylePromptSuffix: guide?.promptSuffix ?? "",
  };
  const top = (args.topPosts ?? []).slice(0, 4).map((p) => ({
    id: p.id,
    kind: p.kind,
    engagement: p.metrics ?? (p.engagement !== undefined ? Math.round(p.engagement) : undefined),
    caption: clip(p.caption, 90),
    shows: p.visualTags?.length ? p.visualTags.join("; ") : undefined,
  }));
  return `ART BRAND:
${JSON.stringify(brand, null, 2)}${top.length ? `\nTOP POSTS (highest engagement first; use an id in inspired_by_post_id):\n${JSON.stringify(top, null, 2)}` : ""}`;
}

/** Validates the model's raw "art" object and attaches the overlay text from the final copy. `zone` is the layout's locked text zone. */
export function artFromPost(raw: unknown, copy: { headline?: string; subline?: string; items?: string[]; cta?: string }, zone?: string): ArtDirection | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const parsed = ArtDirectionSchema.safeParse({
    ...r,
    // The layout decides where the text goes, never the model.
    negative_space_zone: zone ?? r.negative_space_zone ?? FULL_BLEED_ZONE,
    overlay_text_layers: { headline: copy.headline ?? "", subhead: copy.subline ?? "", supporting_bullets: copy.items ?? [], cta: copy.cta ?? "" },
  });
  return parsed.success ? parsed.data : null;
}

/** Drop sentences that ask the image model to draw an overlay card/box/panel (text is composited later). */
export function stripTextCardSentences(prompt: string): string {
  const sentences = prompt.match(/[^.!?]+[.!?]*/g) ?? [prompt];
  const kept = sentences.filter((s) => !/\b(overlay|card|text box|panel)\b/i.test(s));
  return kept.length ? kept.join("").trim() : prompt;
}

/** Image-model prompt from a validated art direction: the compiled prompt plus layout and exclusions. */
export function imagePromptFromDirection(d: ArtDirection): string {
  const hasZone = !d.negative_space_zone.startsWith("none");
  return [
    // Belt and braces: the model is told not to, but raw hex codes confuse diffusion models.
    stripTextCardSentences(d.compiled_image_prompt).replace(/#[0-9a-f]{3,8}\b/gi, "").replace(/\s{2,}/g, " ").trim(),
    hasZone && `Keep the ${d.negative_space_zone.slice(0, 120)} clean and calm, with no card, box or panel drawn there.`,
    "Photograph only: do not render any text, letters, numbers, logos or watermarks in the image.",
    d.negative_prompt && `Avoid: ${d.negative_prompt}.`,
  ]
    .filter(Boolean)
    .join(" ");
}
