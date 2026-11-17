import type { BrandModel, Measures } from "./model";
import type { Facet } from "../measure/rate";

/** One place where a number measured from the site copy disagrees with what the profile says. */
export interface Contradiction {
  id: string;
  /** Dotted field path the owner can change or lock, e.g. "voice.tone.formal_casual". */
  path: string;
  /** One plain sentence for the owner. */
  text: string;
  /** Set when a rated value exists to move to; the UI offers "Use N". */
  suggested?: number;
}

/** Rated and stated values this far apart (0–100) count as a disagreement. */
export const RATED_GAP = 25;
const MIN_RATED_TEXTS = 5;

const get = (model: BrandModel, path: string): number | undefined => {
  const [layer, a, b] = path.split(".");
  const root = (model as unknown as Record<string, Record<string, unknown>>)[layer];
  const v = b ? (root?.[a] as Record<string, unknown> | undefined)?.[b] : root?.[a];
  return typeof v === "number" ? v : undefined;
};

const pathOf = (f: Facet) => (["sincerity", "excitement", "competence", "sophistication", "ruggedness"].includes(f) ? `personality.${f}` : `voice.tone.${f}`);

/** Free rules, no LLM: measured numbers against the stated profile. Locked fields are the owner's call and are skipped. */
export function findContradictions(model: BrandModel, measures: Measures | undefined): Contradiction[] {
  const text = measures?.text;
  if (!text || text.n < 150) return [];
  const out: Contradiction[] = [];
  const open = (path: string) => !model.meta[path]?.locked;
  // A rated value already comes from the copy, so only profile values set another way are checked against the numbers.
  const stated = (path: string) => (model.meta[path]?.method === "rated" || !open(path) ? undefined : get(model, path));

  const casual = stated("voice.tone.formal_casual");
  const words = text.sentenceLength?.mean;
  const flesch = text.readability?.fleschReadingEase;
  if (casual !== undefined && words !== undefined && flesch !== undefined) {
    if (casual >= 65 && words > 22 && flesch < 45)
      out.push({ id: "formal-copy", path: "voice.tone.formal_casual", text: `Your tone is set to casual, but your site averages ${Math.round(words)} words a sentence and reads as hard going.` });
    if (casual <= 35 && words < 12 && flesch > 70)
      out.push({ id: "casual-copy", path: "voice.tone.formal_casual", text: `Your tone is set to formal, but your site averages ${Math.round(words)} words a sentence and reads easily.` });
  }

  const lively = (text.exclamationPer100Words ?? 0) < 0.1 && (text.emojiPer100Words ?? 0) < 0.1;
  const matter = stated("voice.tone.enthusiastic_matter");
  const excitement = stated("personality.excitement");
  if (lively && matter !== undefined && matter <= 30)
    out.push({ id: "quiet-copy", path: "voice.tone.enthusiastic_matter", text: "Your tone is set to enthusiastic, but your site has almost no exclamation marks or emoji." });
  else if (lively && excitement !== undefined && excitement >= 70)
    out.push({ id: "calm-copy", path: "personality.excitement", text: "You describe the brand as daring and energetic, but your site has almost no exclamation marks or emoji." });

  // A value the owner typed against what the judge read in the copy.
  for (const [facet, r] of Object.entries(measures?.rating?.facets ?? {}) as [Facet, { value: number; n: number }][]) {
    const path = pathOf(facet);
    const v = get(model, path);
    const meta = model.meta[path];
    if (v === undefined || !open(path) || meta?.source !== "user" || r.n < MIN_RATED_TEXTS) continue;
    if (Math.abs(r.value - v) > RATED_GAP)
      out.push({ id: `rated-${facet}`, path, text: `You set ${facet.replace("_", " / ")} to ${Math.round(v)}, but your site copy reads closer to ${Math.round(r.value)}.`, suggested: Math.round(r.value) });
  }
  return out;
}
