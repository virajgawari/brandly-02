import { FACETS, type Facet } from "./rate";

export type Labels = Partial<Record<Facet, number>>;
export type Scores = Partial<Record<Facet, number>>;

export interface FacetAgreement {
  /** Texts with a hand label for this facet. */
  labelled: number;
  /** Of those, texts the judge scored with a quote. */
  scored: number;
  /** scored / labelled. */
  coverage: number;
  /** Mean absolute error in points (0–100). */
  mae: number | null;
  /** Rank correlation, -1..1. Needs at least 3 scored texts. */
  spearman: number | null;
  /** Share of scored texts within 15 points of the label. */
  within15: number | null;
}

/** Average rank (ties share the mean of their positions). */
function ranks(xs: number[]): number[] {
  const order = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) r[order[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}

export function spearman(a: number[], b: number[]): number | null {
  if (a.length < 3) return null;
  const ra = ranks(a);
  const rb = ranks(b);
  const m = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const ma = m(ra);
  const mb = m(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
}

/** Judge scores against hand labels. `perRun[run][text]` is what `scoreTexts` returns; a text's score is its mean across runs. */
export function agreement(labels: Labels[], perRun: Scores[][]): Record<Facet, FacetAgreement> {
  const out = {} as Record<Facet, FacetAgreement>;
  for (const f of FACETS) {
    const gold: number[] = [];
    const judged: number[] = [];
    let labelled = 0;
    labels.forEach((l, i) => {
      const g = l[f];
      if (g === undefined) return;
      labelled++;
      const s = perRun.map((run) => run[i]?.[f]).filter((v): v is number => v !== undefined);
      if (!s.length) return;
      gold.push(g);
      judged.push(s.reduce((x, y) => x + y, 0) / s.length);
    });
    const n = gold.length;
    out[f] = {
      labelled,
      scored: n,
      coverage: labelled ? n / labelled : 0,
      mae: n ? gold.reduce((s, g, i) => s + Math.abs(g - judged[i]), 0) / n : null,
      spearman: spearman(gold, judged),
      within15: n ? gold.filter((g, i) => Math.abs(g - judged[i]) <= 15).length / n : null,
    };
  }
  return out;
}
