// Replays fixed briefs through post generation and scores the output.
//   npm run eval -- --dry                 no LLM, prints the plan and prompt sizes
//   npm run eval -- --limit 2 --no-db     real LLM calls, nothing stored
//   npm run eval -- --tag baseline        full run, rows written to eval_runs
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

try { process.loadEnvFile(path.resolve(".env.local")); } catch { /* env may come from the shell */ }

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

interface Brief { id: string; brand: string; platforms: string[]; template?: string; topic?: string; seed: number }

/** Deterministic PRNG so the same brief always gets the same format/hook/pillar. */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const dry = flag("dry");
  const noDb = flag("no-db") || dry;
  const limit = Number(opt("limit") ?? Infinity);
  const tag = opt("tag") ?? null;
  const onlyBrand = opt("brand");
  const delayMs = Number(opt("delay") ?? 0) * 1000; // pause between briefs to stay under provider rate limits

  const dir = path.resolve("evals/briefs");
  let briefs: Brief[] = readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")));
  if (onlyBrand) briefs = briefs.filter((b) => b.brand === onlyBrand);
  briefs = briefs.slice(0, limit);

  const { BRANDS } = await import("../evals/fixtures");
  const { scorePost } = await import("../evals/score");
  const { pickBrief } = await import("../lib/content/brief");
  const { buildPostPrompt, postSchemaFor, bannedWords, POST_PROMPT_VERSION, POST_TEMPERATURE } = await import("../lib/content/prompt");
  const { PLATFORM_LIMITS } = await import("../lib/templates");
  const { GeneratedPostSchema } = await import("../lib/brand/schemas");
  const { generateStructured } = await import("../lib/llm");
  const { withLlmContext } = await import("../lib/llm-log");

  const emptyHistory = { posts: [], dislikes: { formats: {}, layouts: {} } };
  const runId = randomUUID();
  let sha: string | null = null;
  try { sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* not a repo */ }

  let pg: import("pg").Client | undefined;
  if (!noDb) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (use --no-db to skip storing).");
    const { Client } = await import("pg");
    pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await pg.connect();
  }

  console.log(`eval ${runId.slice(0, 8)} · ${POST_PROMPT_VERSION} · ${briefs.length} briefs${dry ? " · dry" : ""}${noDb ? " · no-db" : ""}`);
  let passed = 0;

  for (const [n, b] of briefs.entries()) {
    if (n > 0 && delayMs && !dry) await new Promise((r) => setTimeout(r, delayMs));
    const model = BRANDS[b.brand];
    if (!model) throw new Error(`${b.id}: unknown brand "${b.brand}" (see evals/fixtures.ts)`);
    const platforms = b.platforms as import("../lib/types").Platform[];
    const template = b.template as import("../lib/types").TemplateCategory | undefined;
    const brief = pickBrief(model, emptyHistory, template, { allowCarousel: true, rand: mulberry32(b.seed) });
    const prompt = buildPostPrompt({ model, brief, history: emptyHistory, platforms, template, topic: b.topic });

    if (dry) {
      console.log(`  ${b.id.padEnd(16)} format=${brief.format.id} hook=${brief.hook.id} pillar=${brief.pillar ?? "-"} prompt≈${Math.round((prompt.system.length + prompt.user.length + prompt.brandContext.length) / 4)} tok`);
      continue;
    }

    const calls: import("../lib/llm-log").LlmCallRecord[] = [];
    let post: import("../lib/brand/schemas").GeneratedPostResult | null = null;
    let error: string | undefined;
    const opts = { task: "fast" as const, maxTokens: 2200, cachedContext: prompt.brandContext, temperature: POST_TEMPERATURE };
    await withLlmContext({ feature: "eval", brandId: model.id, promptVersion: POST_PROMPT_VERSION, calls }, async () => {
      try {
        try { post = await generateStructured(postSchemaFor(model), prompt.system, prompt.user, opts); }
        // Same fallback as production: accept a valid post, the scorer then flags banned phrases.
        catch { post = await generateStructured(GeneratedPostSchema, prompt.system, prompt.user, opts); }
      } catch (e) { error = e instanceof Error ? e.message : String(e); }
    });

    const result = scorePost({ post, banned: bannedWords(model), platforms, limits: PLATFORM_LIMITS, error });
    const last = calls.at(-1);
    const sum = (k: "input_tokens" | "output_tokens" | "latency_ms") => calls.reduce((n, c) => n + (c[k] ?? 0), 0);
    if (result.passed) passed++;
    console.log(`  ${result.passed ? "PASS" : "FAIL"} ${b.id.padEnd(16)} ${last?.model ?? "-"} ${sum("latency_ms")}ms${result.failures.length ? "  " + result.failures.join("; ") : ""}`);

    await pg?.query(
      `insert into public.eval_runs (run_id, tag, git_sha, prompt_version, brief_id, brand_key, provider, model, output, scores, passed, error, input_tokens, output_tokens, latency_ms)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [runId, tag, sha, POST_PROMPT_VERSION, b.id, b.brand, last?.provider ?? null, last?.model ?? null, post ? JSON.stringify(post) : null,
        JSON.stringify({ ...result.scores, failures: result.failures }), result.passed, error ?? null, sum("input_tokens"), sum("output_tokens"), sum("latency_ms")]
    );
  }

  await pg?.end();
  if (!dry) console.log(`${passed}/${briefs.length} passed`);
  if (!dry && passed < briefs.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
