import { words } from "./tokenize";

/** Paragraph-sized chunks (min to max words) built from whole sentences of the crawled pages. */
export function paragraphs(pages: { text: string }[], opts: { min?: number; max?: number } = {}): string[] {
  const { min = 20, max = 80 } = opts;
  const out: string[] = [];
  for (const p of pages) {
    const sents = (p.text ?? "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
    let cur: string[] = [];
    let count = 0;
    for (const s of sents) {
      cur.push(s);
      count += words(s).length;
      if (count >= min) {
        if (count <= max) out.push(cur.join(" "));
        cur = [];
        count = 0;
      }
    }
  }
  return out;
}
