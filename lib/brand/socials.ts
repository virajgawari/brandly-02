import type { BrandSources } from "@/lib/types";

export type SocialKey = "website" | "instagram" | "facebook" | "linkedin" | "x" | "googleBusiness";

export const SOCIALS: { key: SocialKey; label: string; placeholder: string; postiz?: string[] }[] = [
  { key: "website", label: "Website", placeholder: "yourbrand.com" },
  { key: "instagram", label: "Instagram", placeholder: "yourbrand", postiz: ["instagram", "instagram-standalone"] },
  { key: "facebook", label: "Facebook", placeholder: "facebook.com/yourbrand", postiz: ["facebook"] },
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/company/yourbrand", postiz: ["linkedin", "linkedin-page"] },
  { key: "x", label: "X", placeholder: "yourbrand", postiz: ["x"] },
  { key: "googleBusiness", label: "Google Business Profile", placeholder: "g.page/yourbrand or Maps link" },
];

const HANDLE_KEYS: SocialKey[] = ["instagram", "x"];

/**
 * Tidies what someone typed into a link field. Handles (Instagram, X) are stored without "@" or URL;
 * everything else is stored as a https URL. Returns "" when the input has nothing usable.
 */
export function cleanSocial(key: SocialKey, input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  if (HANDLE_KEYS.includes(key)) {
    const m = raw.match(/(?:instagram\.com|twitter\.com|x\.com)\/@?([A-Za-z0-9._]+)/i);
    const handle = (m ? m[1] : raw).replace(/^@/, "").replace(/[/?#].*$/, "");
    return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : "";
  }
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

/** Number of filled link fields, for the profile completeness hint. */
export function socialCount(sources: BrandSources): number {
  return SOCIALS.filter((s) => Boolean(sources[s.key])).length;
}
