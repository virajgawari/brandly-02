import type { BrandModel } from "./model";

/** Real contact details the call to action may use. Empty when the brand has none. */
export function businessLine(model?: BrandModel): string {
  const b = model?.strategy.business;
  if (!b) return "";
  const parts = [b.ctaLink && `link ${b.ctaLink}${b.ctaLabel ? ` ("${b.ctaLabel}")` : ""}`, b.phone && `phone ${b.phone}`, b.address && `address ${b.address}`, b.hours && `hours ${b.hours}`].filter(Boolean);
  return parts.length ? `Real business details (use only these, in the CTA when it fits, never invent others): ${parts.join("; ")}.` : "";
}
