import type { Finding } from "./stages/types";

/** What the live brand board shows, derived from the findings streamed so far. */
export interface BoardState {
  name?: string;
  logo?: string;
  logoMissing: boolean;
  swatches: string[];
  fonts: string[];
  photos: string[];
  oneLiner?: string;
  status?: string;
}

export function boardFromFindings(findings: Finding[]): BoardState {
  const by = new Map(findings.map((f) => [f.id, f]));
  const site = by.get("site");
  const logo = by.get("logo");
  const photos = by.get("photos");
  const synth = by.get("synth");
  const working = findings.filter((f) => f.status === "info").at(-1);
  return {
    name: site?.status === "done" ? site.detail : undefined,
    logo: logo?.image,
    logoMissing: logo?.status === "warn",
    swatches: by.get("colors")?.swatches ?? by.get("logo-colours")?.swatches ?? [],
    fonts: by.get("fonts")?.fonts ?? [],
    photos: photos?.images ?? (photos?.image ? [photos.image] : []),
    oneLiner: synth?.status === "done" ? synth.detail : undefined,
    status: working?.label,
  };
}
