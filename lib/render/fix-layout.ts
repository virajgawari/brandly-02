import { layoutNeedsPhoto } from "@/lib/content/brief";
import type { LayoutId } from "@/lib/brand/model";

export interface FixInput {
  layout: LayoutId;
  /** The brand's allowed layouts. */
  allowed: LayoutId[];
  hasPhoto: boolean;
  headline: string;
  subline?: string;
  itemCount?: number;
  hasStat?: boolean;
}

export interface FixResult {
  layout: LayoutId;
  headline: string;
  subline?: string;
  changes: string[];
}

const MAX_HEADLINE = 70;
const MAX_SUBLINE = 110;
const TEXT_LED: LayoutId[] = ["quote", "split", "framed", "big-number", "checklist", "myth-fact"];

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max).replace(/\s+\S*$/, "");
  return `${cut.replace(/[,;:\s]+$/, "")}…`;
}

/** Rule-based tidy-up: no LLM. Swaps a layout that can't work, and trims text that would overflow. */
export function fixLayout(i: FixInput): FixResult {
  const changes: string[] = [];
  let layout = i.layout;
  const swap = (to: LayoutId | undefined, why: string) => {
    if (to && to !== layout) {
      layout = to;
      changes.push(why);
    }
  };
  if (layoutNeedsPhoto(layout) && !i.hasPhoto) swap(i.allowed.find((l) => TEXT_LED.includes(l) && !["checklist", "myth-fact", "big-number"].includes(l)), "Switched to a layout that doesn't need a photo.");
  if (layout === "big-number" && !i.hasStat) swap(i.allowed.find((l) => l === "quote" || l === "split"), "No number to show, so switched layout.");
  if ((layout === "checklist" || layout === "myth-fact") && !(i.itemCount && i.itemCount >= 2)) swap(i.allowed.find((l) => l === "quote" || l === "split"), "Not enough list items, so switched layout.");
  const headline = clip(i.headline, MAX_HEADLINE);
  if (headline !== i.headline) changes.push("Shortened the headline.");
  const subline = i.subline ? clip(i.subline, MAX_SUBLINE) : i.subline;
  if (subline !== i.subline) changes.push("Shortened the supporting line.");
  return { layout, headline, subline, changes };
}
