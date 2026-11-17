// Builds the industry word-count corpora used by lib/measure log-odds scores. No LLM calls.
//   npm run corpus:build -- --industry fitness_sports     one industry
//   npm run corpus:build                                  all industries in data/corpus/seeds.json
//   flags: --delay <ms> pause between sites (default 1500), --pages <n> pages per site (default 10)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { crawlSite } from "../lib/crawl";
import type { Corpus } from "../lib/measure/lexicon";
import { wordCounts } from "../lib/measure/text";

const argv = process.argv.slice(2);
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const only = opt("industry");
const delay = Number(opt("delay") ?? 1500);
const pages = Number(opt("pages") ?? 10);

const dir = path.resolve("data", "corpus");
const seeds = JSON.parse(readFileSync(path.join(dir, "seeds.json"), "utf8")) as Record<string, string[]>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MIN_COUNT = 2; // singletons are noise and bloat the file
const toCorpus = (counts: Map<string, number>, docs: number): Corpus => {
  const kept = [...counts].filter(([, c]) => c >= MIN_COUNT).sort((a, b) => b[1] - a[1]);
  return { docs, total: kept.reduce((s, [, c]) => s + c, 0), counts: Object.fromEntries(kept) };
};

async function main() {
  const industries = Object.keys(seeds).filter((k) => !only || k === only);
  if (!industries.length) throw new Error(`No seeds for "${only}"`);
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();

  for (const industry of industries) {
    const counts = new Map<string, number>();
    let docs = 0;
    for (const url of seeds[industry]) {
      try {
        const r = await crawlSite(url, { maxPages: pages });
        const texts = [r.home.copySample, ...r.pages.map((p) => p.text)].filter(Boolean);
        for (const t of texts) for (const [w, c] of wordCounts(t)) counts.set(w, (counts.get(w) ?? 0) + c);
        docs += texts.length;
        console.log(`  ${industry}  ${url}  ${texts.length} pages`);
      } catch (e) {
        console.warn(`  ${industry}  ${url}  skipped: ${(e as Error).message}`);
      }
      await sleep(delay);
    }
    const corpus = toCorpus(counts, docs);
    writeFileSync(path.join(dir, `${industry}.json`), JSON.stringify(corpus));
    console.log(`${industry}: ${docs} pages, ${corpus.total} words, ${Object.keys(corpus.counts).length} distinct\n`);
  }

  // Baseline = sum of every industry file on disk (so a single-industry rebuild refreshes it too).
  const all = new Map<string, number>();
  let docs = 0;
  for (const k of Object.keys(seeds)) {
    try {
      const c = JSON.parse(readFileSync(path.join(dir, `${k}.json`), "utf8")) as Corpus;
      docs += c.docs;
      for (const [w, n] of Object.entries(c.counts)) all.set(w, (all.get(w) ?? 0) + n);
    } catch { /* industry not built yet */ }
  }
  writeFileSync(path.join(dir, "_all.json"), JSON.stringify(toCorpus(all, docs)));
  console.log(`Done in ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
