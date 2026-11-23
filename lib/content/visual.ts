// Turns a post's structured visual brief into an image-model prompt.
// Exact colours, fonts and the logo come from the branded layout, so the photo
// only needs to be in tone: colours are described in words (models ignore hex).
import type { BrandModel } from "@/lib/brand/model";
import { paletteToWords } from "@/lib/brand/color";
import type { BrandDNA, VisualBrief } from "@/lib/types";

/** Whether this brand's feed shows people, and how; chosen by chance in line with the share seen in its posts. */
export function peopleClause(guide: BrandModel["expression"]["styleGuide"] | undefined, rand: () => number = Math.random): string {
  const pct = guide?.peoplePct;
  if (pct === undefined) return "";
  if (rand() * 100 < pct) return `Include a person, in the brand's usual style: ${guide?.peopleStyle || "candid and natural"}. Natural-looking, not a stock-photo smile.`;
  return pct < 20 ? "No people in the frame." : "";
}

/** Quality and composition direction for every generated photo: studio finish, subject placed to leave room for text. */
export const STUDIO_CLAUSE =
  "Professional studio-quality commercial photograph: razor-sharp focus on the subject, soft key light with gentle fill and subtle rim light, clean controlled backdrop, natural full colour, high-end retouching, shallow depth of field, shot on a full-frame camera with an 85mm lens. Place the subject off-centre in the upper two thirds and keep the lower third calm and uncluttered for the headline.";

export function imagePromptFromBrief(brief: VisualBrief | undefined, model?: BrandModel, dna?: BrandDNA, fallback = "", rand: () => number = Math.random): string {
  if (!brief || !(brief.subject || brief.setting)) return fallback;
  const c = model?.expression.tokens.color;
  const hexes = c ? [c.primary.$value, c.secondary.$value, c.accent.$value] : dna ? [dna.colors.primary, dna.colors.secondary, dna.colors.accent] : [];
  const colours = paletteToWords(hexes);
  const guide = model?.expression.styleGuide;
  if (guide?.promptSuffix) {
    // Five parts: medium and style, subject and action, composition and negative space, lighting and palette, texture and exclusions.
    return [
      guide.medium && `${guide.medium}.`,
      `${brief.subject}${brief.setting ? `, ${brief.setting}` : ""}.`,
      `${brief.composition ? `${brief.composition}. ` : ""}Calm, empty negative space for a headline.`,
      brief.lighting && `${brief.lighting}.`,
      guide.promptSuffix.replace(/\s+$/, ""),
      STUDIO_CLAUSE,
      // A product shot is about the product, so never ask for (or ban) people there.
      !brief.usesProductPhoto && peopleClause(guide, rand),
      "No text, letters, logos or watermarks, no clutter.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  const imagery = model?.expression.imageryStyle || dna?.visual_style || "";
  const assets = model?.expression.distinctiveAssets?.slice(0, 2) ?? [];
  const vibe = (model?.content.vibe ?? dna?.vibe ?? []).slice(0, 3);
  return [
    `Photograph: ${brief.subject}.`,
    brief.setting && `Setting: ${brief.setting}.`,
    brief.lighting && `Lighting: ${brief.lighting}.`,
    brief.composition && `Composition: ${brief.composition}. Leave calm, uncluttered space for a headline.`,
    imagery && `Style: ${imagery}.`,
    colours.length && `Colour mood: ${colours.join(", ")} tones.`,
    vibe.length && `Mood: ${vibe.join(", ")}.`,
    assets.length && `Brand cues: ${assets.join("; ")}.`,
    STUDIO_CLAUSE,
    "No text, letters, logos or watermarks, no clutter.",
  ]
    .filter(Boolean)
    .join(" ");
}
