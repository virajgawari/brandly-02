import "server-only";
import { z } from "zod";
import type { Session } from "@/lib/db/session";
import { generateStructured } from "@/lib/llm";
import { lastLlmCallId } from "@/lib/llm-log";
import type { GeneratedPost } from "@/lib/types";
import { findPatterns, normaliseSettings, topFindings, type AgentSettings, type Finding, type LearnPost } from "./stats";

export interface AgentConfigRow {
  enabled: boolean;
  window_days: number;
  min_sample: number;
  min_lift: number;
  engagement_weight: number;
  auto_apply: boolean;
  use_llm: boolean;
}

export const DEFAULT_CONFIG: AgentConfigRow = { enabled: true, window_days: 90, min_sample: 4, min_lift: 0.3, engagement_weight: 0.5, auto_apply: false, use_llm: true };

export async function loadConfig(s: Session): Promise<AgentConfigRow> {
  const { data } = await s.db.from("agent_config").select("*").eq("workspace_id", s.workspaceId).maybeSingle();
  return { ...DEFAULT_CONFIG, ...(data ?? {}) };
}

export const settingsOf = (c: AgentConfigRow): AgentSettings =>
  normaliseSettings({ windowDays: c.window_days, minSample: c.min_sample, minLift: c.min_lift, engagementWeight: c.engagement_weight });

interface PostRow {
  id: string;
  status: LearnPost["status"];
  template: string | null;
  content: GeneratedPost | null;
  original_content: GeneratedPost | null;
  generation_id: string | null;
  product_id: string | null;
}

/** Loads a brand's recent posts with their feedback and latest metrics, shaped for the stats module. */
export async function loadLearnPosts(s: Session, brandId: string, windowDays: number): Promise<{ posts: LearnPost[]; withMetrics: number }> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data, error } = await s.db
    .from("posts")
    .select("id, status, template, content, original_content, generation_id, product_id")
    .eq("brand_id", brandId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  const rows = (data ?? []) as PostRow[];
  if (!rows.length) return { posts: [], withMetrics: 0 };

  const ids = rows.map((r) => r.id);
  const [fb, pubs] = await Promise.all([
    s.db.from("generation_feedback").select("post_id, rating").in("post_id", ids),
    s.db.from("post_publications").select("id, post_id").in("post_id", ids),
  ]);
  const ratings = new Map<string, number[]>();
  for (const f of (fb.data ?? []) as { post_id: string; rating: number }[]) ratings.set(f.post_id, [...(ratings.get(f.post_id) ?? []), f.rating]);

  const pubToPost = new Map(((pubs.data ?? []) as { id: string; post_id: string }[]).map((p) => [p.id, p.post_id]));
  const engagement = new Map<string, number>();
  if (pubToPost.size) {
    const { data: m } = await s.db
      .from("post_metrics")
      .select("publication_id, captured_at, impressions, reach, likes, comments, shares, saves")
      .in("publication_id", [...pubToPost.keys()])
      .order("captured_at", { ascending: false });
    const seen = new Set<string>(); // newest snapshot per publication
    const perPost = new Map<string, number[]>();
    for (const r of (m ?? []) as { publication_id: string; impressions: number | null; reach: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null }[]) {
      if (seen.has(r.publication_id)) continue;
      seen.add(r.publication_id);
      const denom = r.reach || r.impressions;
      if (!denom) continue;
      const rate = ((r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0) + (r.saves ?? 0)) / denom;
      const post = pubToPost.get(r.publication_id)!;
      perPost.set(post, [...(perPost.get(post) ?? []), rate]);
    }
    for (const [post, rates] of perPost) engagement.set(post, rates.reduce((a, b) => a + b, 0) / rates.length);
  }

  const productIds = [...new Set(rows.map((r) => r.product_id).filter((x): x is string => !!x))];
  const productName = new Map<string, string>();
  if (productIds.length) {
    const { data: prods } = await s.db.from("products").select("id, name").in("id", productIds);
    for (const p of (prods ?? []) as { id: string; name: string }[]) productName.set(p.id, p.name);
  }

  const posts = rows.map<LearnPost>((r) => ({
    id: r.id,
    status: r.status,
    template: r.template ?? undefined,
    product: r.product_id ? productName.get(r.product_id) : undefined,
    format: r.content?.format,
    hook: r.content?.hook,
    layout: r.content?.rendered?.layout ?? r.content?.layout,
    pillar: r.content?.pillar,
    originalCaption: r.original_content?.caption,
    caption: r.content?.caption,
    ratings: ratings.get(r.id),
    engagement: engagement.get(r.id),
    fit: r.content?.check?.fit?.fit,
  }));
  return { posts, withMetrics: engagement.size };
}

const PhraseSchema = z.object({ insights: z.array(z.object({ key: z.string(), statement: z.string().min(8).max(220) })).max(12) });

/** One cheap call that rewrites the deterministic statements in plain, friendly language. Numbers stay as given. */
async function phrase(findings: Finding[]): Promise<Map<string, string>> {
  const system = `You rewrite analytics findings for a small-business owner. Keep every number and the meaning exactly.
One or two short sentences each, plain words, no hype, no emoji. End with what to do.`;
  const user = JSON.stringify(findings.map((f) => ({ key: f.key, statement: f.statement })));
  const out = await generateStructured(PhraseSchema, system, `Rewrite each statement. Return {"insights":[{"key","statement"}]}.\n${user}`, { task: "fast", maxTokens: 700 });
  const known = new Set(findings.map((f) => f.key));
  return new Map(out.insights.filter((i) => known.has(i.key)).map((i) => [i.key, i.statement.trim()]));
}

export interface LearnResult {
  runId: string;
  postsSeen: number;
  withMetrics: number;
  findings: number;
  llmUsed: boolean;
}

/** Runs one learning pass for a brand: compute findings, phrase them (one LLM call at most), save them. */
export async function runLearner(s: Session, brandId: string, trigger: "manual" | "cron" = "manual"): Promise<LearnResult> {
  const config = await loadConfig(s);
  if (!config.enabled) throw new Error("Learning is switched off for this workspace.");
  const settings = settingsOf(config);
  const { posts, withMetrics } = await loadLearnPosts(s, brandId, settings.windowDays);
  const findings = topFindings(findPatterns(posts, settings));

  let llmCallId: string | undefined;
  let error: string | undefined;
  let phrased = new Map<string, string>();
  if (findings.length && config.use_llm) {
    try {
      phrased = await phrase(findings);
      llmCallId = lastLlmCallId();
    } catch (err) {
      error = `phrasing skipped: ${err instanceof Error ? err.message : String(err)}`; // keep the plain statements
    }
  }

  const { data: run, error: runErr } = await s.db
    .from("agent_runs")
    .insert({ workspace_id: s.workspaceId, brand_id: brandId, trigger, posts_seen: posts.length, with_metrics: withMetrics, findings: findings.length, llm_call_id: llmCallId ?? null, error: error ?? null, created_by: s.userId || null })
    .select("id")
    .single();
  if (runErr) throw runErr;

  if (findings.length) {
    // Upsert on (brand_id, key) and leave status / decided_* alone, so a re-run never undoes a decision.
    const rows = findings.map((f) => ({
      workspace_id: s.workspaceId,
      brand_id: brandId,
      key: f.key,
      dimension: f.dimension,
      value: f.value,
      metric: f.metric,
      direction: f.direction,
      statement: phrased.get(f.key) ?? f.statement,
      stats: { n: f.n, baselineN: f.baselineN, rate: f.rate, baseline: f.baseline, lift: f.lift },
      evidence_post_ids: f.evidencePostIds,
      confidence: f.confidence,
      run_id: run.id,
      ...(config.auto_apply ? { status: "accepted" as const } : {}),
    }));
    const keys = findings.map((f) => f.key);
    const { data: existing } = await s.db.from("agent_insights").select("key").eq("brand_id", brandId).in("key", keys);
    const have = new Set((existing ?? []).map((e: { key: string }) => e.key));
    const fresh = rows.filter((r) => !have.has(r.key));
    const known = rows.filter((r) => have.has(r.key)).map(({ status: _status, ...r }) => r); // eslint-disable-line @typescript-eslint/no-unused-vars
    if (fresh.length) {
      const { error: e } = await s.db.from("agent_insights").insert(fresh);
      if (e) throw e;
    }
    for (const r of known) {
      const { error: e } = await s.db.from("agent_insights").update(r).eq("brand_id", brandId).eq("key", r.key);
      if (e) throw e;
    }
  }
  return { runId: run.id, postsSeen: posts.length, withMetrics, findings: findings.length, llmUsed: phrased.size > 0 };
}

/** Statements the user accepted for a brand, strongest first. Empty on any error. */
export async function acceptedInsights(s: Session, brandId: string): Promise<{ statement: string }[]> {
  try {
    const { data } = await s.db.from("agent_insights").select("statement").eq("brand_id", brandId).eq("status", "accepted").order("confidence", { ascending: false }).limit(8);
    return (data ?? []) as { statement: string }[];
  } catch {
    return [];
  }
}
