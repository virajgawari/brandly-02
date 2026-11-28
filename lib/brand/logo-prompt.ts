import type { BrandModel } from "./model";
import { INDUSTRIES } from "./taxonomy";

// Builds prompts for an AI-made logo mark from the brand profile. Pure, so it is unit-tested.
// The mark is symbol only: image models misspell names, so the name is never put in the prompt.

const CONCEPTS = [
  "an abstract geometric symbol built from simple shapes",
  "a simple symbol loosely inspired by the shape of the letter {initial}, without drawing any letter",
  "a simple symbol that hints at the {industry} business through one clean metaphor",
] as const;

export const LOGO_VARIANTS = CONCEPTS.length;

function feel(model: BrandModel): string {
  const p = model.personality;
  const t = model.voice.tone;
  const words: string[] = [];
  if (p.sophistication >= 60) words.push("refined, premium");
  else if (p.sophistication <= 35) words.push("friendly, approachable");
  if (p.ruggedness >= 60) words.push("sturdy, grounded");
  if (p.excitement >= 65) words.push("energetic");
  else if (p.excitement <= 35) words.push("calm, quiet");
  if (t.funny_serious <= 35) words.push("playful");
  else if (t.funny_serious >= 65) words.push("serious, confident");
  if (p.sincerity >= 65) words.push("warm, honest");
  return words.length ? words.slice(0, 3).join(", ") : "modern, balanced";
}

function colours(model: BrandModel): string {
  const c = model.expression.tokens.color;
  const picks = [c.primary?.$value, c.accent?.$value].filter((v): v is string => /^#[0-9a-f]{6}$/i.test(v ?? ""));
  return picks.length ? `Use only these colours: ${[...new Set(picks)].join(" and ")}.` : "Use one or two flat colours that suit the mood.";
}

/** Prompt for variant `i` (0-based, wraps). */
export function buildLogoPrompt(model: BrandModel, i: number): string {
  const industry = INDUSTRIES.find((x) => x.key === model.strategy.industry)?.label.toLowerCase() ?? "small business";
  const initial = model.name.trim().charAt(0).toUpperCase() || "B";
  const concept = CONCEPTS[((i % CONCEPTS.length) + CONCEPTS.length) % CONCEPTS.length].replace("{initial}", initial).replace("{industry}", industry);
  return [
    `A high-end, minimal brand logo mark for a ${industry} brand: ${concept}.`,
    `Mood: ${feel(model)}.`,
    colours(model),
    "Flat vector style, one single centred symbol, bold simple shapes, generous empty space around it, the way a top design studio would draw it.",
    "Plain pure white background. No text, no letters, no words, no gradients, no shadows, no 3D, no texture, no photo, no mockup, no border, no frame.",
  ].join(" ");
}
