// Seeds a brand with fake posts, feedback and metrics so the learner has something to find.
// Usage: node scripts/seed-learner.mjs <brandId>          add ~36 posts (notes = 'seed:learner')
//        node scripts/seed-learner.mjs <brandId> --clean   remove them again
// Reads DATABASE_URL from .env.local. Never calls an LLM.
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const brandId = process.argv[2];
if (!brandId || !process.env.DATABASE_URL) {
  console.error("Usage: node scripts/seed-learner.mjs <brandId> [--clean]   (DATABASE_URL must be set)");
  process.exit(1);
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const brand = (await db.query("select workspace_id from public.brands where id = $1", [brandId])).rows[0];
if (!brand) {
  console.error("No such brand.");
  process.exit(1);
}
const ws = brand.workspace_id;

if (process.argv.includes("--clean")) {
  const r = await db.query("delete from public.posts where brand_id = $1 and notes = 'seed:learner'", [brandId]);
  console.log(`removed ${r.rowCount} seeded posts`);
  await db.end();
  process.exit(0);
}

// Carousels are made to do well and quotes badly, so the learner has a clear signal to find.
const groups = [
  { format: "carousel", hook: "question", layout: "split", pillar: "education", rate: 0.09 },
  { format: "carousel", hook: "number", layout: "split", pillar: "education", rate: 0.085 },
  { format: "single", hook: "question", layout: "full", pillar: "offer", rate: 0.04 },
  { format: "quote", hook: "statement", layout: "centered", pillar: "inspiration", rate: 0.015 },
];
let n = 0;
for (const g of groups) {
  for (let i = 0; i < 9; i++, n++) {
    const id = randomUUID();
    const caption = `Seeded ${g.format} post ${n}`;
    const content = { format: g.format, hook: g.hook, pillar: g.pillar, layout: g.layout, headline: `Seed ${n}`, caption, hashtags: [] };
    const created = new Date(Date.now() - (n + 1) * 86_400_000);
    await db.query(
      `insert into public.posts (id, workspace_id, brand_id, template, topic, platforms, content, original_content, status, published_at, notes, created_at)
       values ($1,$2,$3,'seed','seed',$4,$5,$5,'published',$6,'seed:learner',$6)`,
      [id, ws, brandId, ["instagram"], JSON.stringify(content), created]
    );
    const pub = (await db.query(`insert into public.post_publications (post_id, workspace_id, platform, status, published_at) values ($1,$2,'instagram','published',$3) returning id`, [id, ws, created])).rows[0];
    const reach = 800 + Math.round(Math.random() * 400);
    const eng = Math.round(reach * g.rate * (0.85 + Math.random() * 0.3));
    await db.query(
      `insert into public.post_metrics (publication_id, workspace_id, reach, impressions, likes, comments, shares, saves, source)
       values ($1,$2,$3,$3,$4,$5,$6,$7,'manual')`,
      [pub.id, ws, reach, Math.round(eng * 0.7), Math.round(eng * 0.1), Math.round(eng * 0.1), Math.round(eng * 0.1)]
    );
  }
}
console.log(`seeded ${n} posts with metrics. Now run the learner for this brand (Home → Insights → refresh, or POST /api/agent/insights).`);
await db.end();
