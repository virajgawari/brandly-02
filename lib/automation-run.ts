import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Platform, TriggerConfig } from "@/lib/types";
import { BRAND_SELECT, RULE_SELECT, brandFromRow, ruleFromRow, type BrandRow, type RuleRow } from "@/lib/db/mappers";
import { fetchProductPageContent, fetchRssFeed } from "@/lib/automation-utils";
import { generatePost } from "@/lib/content/generate";
import { withLlmContext } from "@/lib/llm-log";
import { nextRunAfter } from "@/lib/automation-schedule";

export type RunOutcome = { status: "drafted" | "skipped" | "error"; postId?: string; message?: string };

const RETRY_MS = 3_600_000;

/**
 * Runs one rule: fetches its trigger context, writes a DRAFT post (never auto-publishes),
 * and moves next_run_at on. `db` must be able to see the rule (user client or admin).
 */
export async function runRule(db: SupabaseClient, ruleId: string, workspaceId: string, userId?: string): Promise<RunOutcome> {
  const { data: row } = await db.from("automation_rules").select(RULE_SELECT).eq("id", ruleId).eq("workspace_id", workspaceId).maybeSingle();
  if (!row) return { status: "error", message: "Rule not found" };
  const rule = ruleFromRow(row as unknown as RuleRow);
  const advance = (patch: Record<string, unknown>) => db.from("automation_rules").update(patch).eq("id", ruleId);
  const { data: ws } = await db.from("workspaces").select("timezone").eq("id", workspaceId).maybeSingle();
  const tz = (ws?.timezone as string | undefined) || "UTC";
  try {
    const { data: brandRow } = await db.from("brands").select(BRAND_SELECT).eq("id", rule.brandId).maybeSingle();
    const brand = brandRow ? brandFromRow(brandRow as unknown as BrandRow) : null;
    if (!brand) throw new Error("Brand not found");

    const t: TriggerConfig = rule.trigger;
    let context: string | undefined;
    let topic: string | undefined;
    let trigger = t;
    if (t.type === "rss") {
      const items = await fetchRssFeed(t.feedUrl);
      if (!items) throw new Error(`Could not read ${t.feedUrl}`);
      const latest = items[0];
      const link = latest?.link ?? latest?.guid ?? latest?.title;
      if (!latest || link === t.lastSeen) {
        await advance({ next_run_at: nextRunAfter(t, new Date(), tz).toISOString(), last_run_at: new Date().toISOString() });
        return { status: "skipped", message: "No new articles." };
      }
      context = `Latest article from ${t.feedUrl}:\nTitle: ${latest.title}\nSnippet: ${latest.contentSnippet || latest.summary || latest.description || ""}`;
      trigger = { ...t, lastSeen: link };
    } else if (t.type === "product_update") {
      const page = await fetchProductPageContent(t.sourceUrl);
      if (!page) throw new Error(`Could not read ${t.sourceUrl}`);
      context = `Product page content from ${t.sourceUrl}:\n${page.slice(0, 1000)}`;
    } else {
      topic = t.topic;
    }

    const result = await withLlmContext({ feature: "automation", workspaceId, brandId: brand.id, userId }, () =>
      generatePost({ feature: "automation", model: brand.model, dna: brand.dna, platforms: (rule.platforms.length ? rule.platforms : ["instagram"]) as Platform[], topic, triggerContext: context })
    );
    if ("error" in result) throw new Error(result.error);

    const postId = randomUUID();
    const when = new Date().toISOString();
    const { error } = await db.from("posts").insert({
      id: postId,
      brand_id: brand.id,
      workspace_id: workspaceId,
      content: result.post,
      original_content: result.post,
      platforms: rule.platforms,
      status: "draft",
      scheduled_at: when,
      generation_id: result.generationId ?? null,
      topic: topic ?? null,
      created_by: userId ?? null,
    });
    if (error) throw error;
    await db.from("content_events").insert({ post_id: postId, workspace_id: workspaceId, user_id: userId ?? null, llm_call_id: result.generationId ?? null, event: "generated", props: { automation: rule.name } });
    await advance({
      trigger,
      status: "active",
      last_run_at: when,
      next_run_at: nextRunAfter(trigger, new Date(), tz).toISOString(),
      posts_generated: rule.postsGenerated + 1,
    });
    return { status: "drafted", postId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[automation run]", ruleId, message);
    await advance({ next_run_at: new Date(Date.now() + RETRY_MS).toISOString() });
    return { status: "error", message };
  }
}

/** Runs every active rule that is due. A rule is claimed by pushing next_run_at out first, so overlapping runs skip it. */
export async function runDueRules(db: SupabaseClient, deadline: number, limit = 5) {
  const now = new Date().toISOString();
  const { data } = await db
    .from("automation_rules")
    .select("id, workspace_id, next_run_at")
    .eq("status", "active")
    .lte("next_run_at", now)
    .order("next_run_at")
    .limit(limit);
  const out = { drafted: 0, skipped: 0, error: 0 };
  for (const r of data ?? []) {
    if (Date.now() > deadline) break;
    const { data: claimed } = await db
      .from("automation_rules")
      .update({ next_run_at: new Date(Date.now() + RETRY_MS).toISOString() })
      .eq("id", r.id)
      .eq("next_run_at", r.next_run_at)
      .select("id");
    if (!claimed?.length) continue;
    out[(await runRule(db, r.id as string, r.workspace_id as string)).status]++;
  }
  return out;
}
