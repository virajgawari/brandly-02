/** Which optional elements appear on the rendered image. Everything shows unless set to false. */
export interface ShowFlags {
  logo?: boolean;
  cta?: boolean;
  subline?: boolean;
  /** The photo. */
  image?: boolean;
  headline?: boolean;
}

/** Drops the hidden elements before layouts run; layouts already treat all three as optional. */
export function applyShow<P extends { subline?: string; cta?: string }>(
  post: P,
  logo: string | undefined,
  show?: ShowFlags
): { post: P; logo: string | undefined } {
  if (!show) return { post, logo };
  return {
    post: { ...post, ...(show.subline === false ? { subline: undefined } : {}), ...(show.cta === false ? { cta: undefined } : {}) },
    logo: show.logo === false ? undefined : logo,
  };
}

/** Keeps only boolean flags from untrusted input. */
export function cleanShow(raw: unknown): ShowFlags | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: ShowFlags = {};
  for (const k of ["logo", "cta", "subline", "image", "headline"] as const) if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
  return Object.keys(out).length ? out : undefined;
}
