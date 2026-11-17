export interface CiteItem {
  id: string;
  label: string;
}

export interface EvidenceRefs {
  /** Prompt block listing the numbered evidence the model may cite. Empty when there is nothing to cite. */
  block: string;
  /** Maps "E1"-style refs to evidence ids; unknown refs are dropped and repeats removed. */
  resolve(refs: readonly string[] | undefined): string[];
}

/** Numbers evidence items E1…En for a prompt and turns the model's refs back into evidence ids. */
export function evidenceRefs(items: readonly CiteItem[]): EvidenceRefs {
  const byRef = new Map(items.map((it, i) => [`E${i + 1}`, it.id]));
  const block = items.length
    ? `Evidence you can cite:\n${items.map((it, i) => `E${i + 1} = ${it.label}`).join("\n")}`
    : "";
  return {
    block,
    resolve(refs) {
      const out = new Set<string>();
      for (const r of refs ?? []) {
        const id = byRef.get(r.trim().toUpperCase());
        if (id) out.add(id);
      }
      return [...out];
    },
  };
}

/**
 * evidenceByPath for a patch: each model path gets the evidence its field key cited,
 * or `fallback` when the model cited nothing valid.
 */
export function citeOptions(
  cites: Record<string, string[]> | undefined,
  fieldToPaths: Record<string, string[]>,
  resolve: EvidenceRefs["resolve"],
  fallback: string[] | Record<string, string[]>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [field, paths] of Object.entries(fieldToPaths)) {
    const cited = resolve(cites?.[field]);
    const fb = Array.isArray(fallback) ? fallback : fallback[field] ?? [];
    for (const p of paths) out[p] = cited.length ? cited : fb;
  }
  return out;
}
