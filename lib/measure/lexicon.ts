import { STOPWORDS } from "./tokenize";

const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

/** Words that point at something you can see, touch, count or buy. */
export const CONCRETE = set(`
  jar bottle box bag pack packet tin can cup mug plate bowl spoon knife pan pot oven kettle bread cake cookie chocolate coffee tea milk
  butter cheese egg rice flour sugar salt honey oil spice fruit apple mango lemon tomato onion garlic chicken fish lamb
  shirt dress jeans shoe sneaker boot sandal jacket coat scarf hat watch ring necklace earring bracelet bag wallet belt
  soap candle cream serum lotion shampoo oil mask brush towel pillow blanket sheet curtain rug chair table sofa bed lamp shelf
  phone laptop screen battery charger cable camera speaker headphone
  shop store studio kitchen garden window door floor wall room office desk
  photo picture video label tag stamp receipt invoice order parcel delivery shipping
  day days week weeks hour hours minute minutes morning evening
  cotton wool silk linen leather steel wood glass copper clay stone
  red blue green yellow black white pink gold silver
  ship ships bake baked brew brewed stitch stitched pour pack packed deliver delivered order ordered cut cooked roast roasted print printed
  kg gram grams ml litre litres cm mm inch inches pcs piece pieces pair pairs
`);

/** Marketing abstractions that say little on their own. */
export const ABSTRACT = set(`
  innovative innovation solution solutions quality passion passionate excellence excellent premium best-in-class leading leader
  world-class cutting-edge seamless robust holistic synergy empower empowering empowered unlock elevate transform transformation
  journey experience experiences vision mission values commitment dedicated dedication unique unparalleled ultimate perfect
  amazing awesome incredible exceptional authentic genuine lifestyle essence spirit magic dream inspire inspiring inspired
  trusted reliable comprehensive tailored bespoke curated crafted effortless effortlessly next-level game-changing revolutionary
  potential growth success impact excellence integrity trust care love
`);

export const MEASURE_UNITS_RE = /(?:[₹$€£]\s?\d|\d\s?(?:%|kg|g|ml|l|cm|mm|m|km|hrs?|mins?|days?|weeks?|pcs|x)\b)/gi;

export interface LogOddsItem {
  word: string;
  /** Z-score of the log-odds ratio: positive = over-used by the brand vs the corpus. */
  z: number;
  brandCount: number;
  corpusCount: number;
}

/**
 * Weighted log-odds with an informative Dirichlet prior (Monroe, Colaresi & Quinn 2008).
 * The corpus supplies the prior, so rare corpus words aren't over-rewarded.
 */
export function logOdds(
  brand: Map<string, number>,
  corpus: Record<string, number>,
  opts: { prior?: number; top?: number; minCount?: number } = {}
): { over: LogOddsItem[]; under: LogOddsItem[] } {
  const { prior = 0.01, top = 20, minCount = 2 } = opts;
  const corpusTotal = Object.values(corpus).reduce((a, b) => a + b, 0);
  const brandTotal = [...brand.values()].reduce((a, b) => a + b, 0);
  if (!corpusTotal || !brandTotal) return { over: [], under: [] };
  const a0 = prior * corpusTotal;
  const items: LogOddsItem[] = [];
  const vocab = new Set([...brand.keys(), ...Object.keys(corpus)]);
  for (const word of vocab) {
    if (STOPWORDS.has(word)) continue;
    const y1 = brand.get(word) ?? 0;
    const y2 = corpus[word] ?? 0;
    if (y1 + y2 < minCount) continue;
    const aw = prior * corpusTotal * ((corpus[word] ?? 0) / corpusTotal) + 0.01; // small floor for unseen words
    const l1 = Math.log((y1 + aw) / (brandTotal + a0 - y1 - aw));
    const l2 = Math.log((y2 + aw) / (corpusTotal + a0 - y2 - aw));
    const variance = 1 / (y1 + aw) + 1 / (y2 + aw);
    items.push({ word, z: (l1 - l2) / Math.sqrt(variance), brandCount: y1, corpusCount: y2 });
  }
  items.sort((x, y) => y.z - x.z);
  return { over: items.filter((i) => i.brandCount > 0).slice(0, top), under: items.filter((i) => i.z < 0).slice(-top).reverse() };
}

export interface Corpus {
  docs: number;
  total: number;
  counts: Record<string, number>;
}
