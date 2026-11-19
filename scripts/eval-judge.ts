// Scores the hand-labelled texts in data/gold/judge.json with the judge and reports agreement.
//   npm run eval:judge -- --dry              no LLM, prints counts per facet
//   npm run eval:judge                       3 judge calls (30 texts, 1 run)
//   npm run eval:judge -- --runs 2 --delay 20 --out gold-run.json
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Labels } from "../lib/measure/agreement";

try { process.loadEnvFile(path.resolve(".env.local")); } catch { /* env may come from the shell */ }

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

const pct = (v: number | null) => (v === null ? "  - " : `${Math.round(v * 100)}%`.padStart(4));
const num = (v: number | null, d = 1) => (v === null ? "  - " : v.toFixed(d).padStart(5));

async function main() {
  // Loaded here so .env.local is in place before lib/llm reads its keys.
  const { agreement } = await import("../lib/measure/agreement");
  const { FACETS, scoreTexts } = await import("../lib/measure/rate");
  const gold = JSON.parse(readFileSync(path.resolve("data/gold/judge.json"), "utf8")) as { labelledBy: string; texts: { id: string; text: string; labels: Labels }[] };
  const texts = gold.texts.map((t) => t.text);
  const labels = gold.texts.map((t) => t.labels);
  const runs = Number(opt("runs") ?? 1);
  const delayMs = Number(opt("delay") ?? 4) * 1000;
  console.log(`${texts.length} texts, labels: ${gold.labelledBy}, ${runs} run(s), ${Math.ceil(texts.length / 10) * runs} judge calls`);

  let perRun: Parameters<typeof agreement>[1];
  let failedCalls = 0, droppedUnquoted = 0;
  if (flag("dry")) {
    perRun = [texts.map(() => ({}))];
  } else {
    const r = await scoreTexts(texts, { runs, batchSize: 10, delayMs });
    perRun = r.perRun;
    failedCalls = r.failedCalls;
    droppedUnquoted = r.droppedUnquoted;
    console.log(`calls ${r.calls}, failed ${failedCalls}, unquoted scores dropped ${droppedUnquoted}`);
  }

  const a = agreement(labels, perRun);
  console.log("\nfacet                    labelled scored  cover   MAE  rank  within15");
  for (const f of FACETS) {
    const x = a[f];
    console.log(`${f.padEnd(24)} ${String(x.labelled).padStart(8)} ${String(x.scored).padStart(6)}  ${pct(x.coverage)} ${num(x.mae)} ${num(x.spearman, 2)}  ${pct(x.within15)}`);
  }
  const out = opt("out");
  if (out) writeFileSync(path.resolve(out), JSON.stringify({ at: new Date().toISOString(), runs, failedCalls, droppedUnquoted, agreement: a }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
