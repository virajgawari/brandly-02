import type { BrandModel } from "./model";

export interface CompletenessItem {
  key: string;
  label: string;
  done: boolean;
  /** Section id used by the brand page's goToSection. */
  section: string;
}

export interface Completeness {
  percent: number;
  items: CompletenessItem[];
  missing: CompletenessItem[];
}

const filled = (s?: string) => !!s && s.trim().length > 2;

/** How much of the brand profile is filled in. Pure, no model calls. */
export function profileCompleteness(m: BrandModel): Completeness {
  const items: CompletenessItem[] = [
    { key: "oneLiner", label: "One-line description", done: filled(m.identity.oneLiner), section: "identity" },
    { key: "offering", label: "What you sell", done: filled(m.strategy.offering), section: "identity" },
    { key: "audience", label: "Who it's for", done: !!m.strategy.audience && ((m.strategy.audience.ageGroups?.length ?? 0) > 0 || (m.strategy.audience.motivations?.length ?? 0) > 0), section: "strategy.audience" },
    { key: "logo", label: "Logo", done: !!(m.expression.logoUrl || m.expression.logoPath), section: "identity" },
    { key: "photos", label: "At least 3 brand photos", done: (m.expression.photos?.length ?? 0) >= 3, section: "identity" },
    { key: "colors", label: "Brand colours", done: !!m.expression.tokens.color.primary.$value && !!m.expression.tokens.color.accent.$value, section: "expression.tokens.color" },
    { key: "voice", label: "Voice description", done: filled(m.voice.description), section: "voice" },
    { key: "sampleLines", label: "Sample lines", done: (m.voice.sampleLines?.length ?? 0) > 0, section: "voice" },
    { key: "pillars", label: "Content pillars", done: (m.content.pillars?.length ?? 0) >= 2, section: "content" },
    { key: "differentiators", label: "What sets you apart", done: (m.strategy.differentiators?.length ?? 0) > 0, section: "identity" },
  ];
  const done = items.filter((i) => i.done).length;
  return { percent: Math.round((done / items.length) * 100), items, missing: items.filter((i) => !i.done) };
}
