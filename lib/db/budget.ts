import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { BudgetError, requireEditor, type Session } from "./session";

/** Max logged LLM calls per workspace per hour (LLM_HOURLY_LIMIT overrides). */
const HOURLY = () => Number(process.env.LLM_HOURLY_LIMIT) || 200;

/**
 * Spend cap: refuses when the workspace already made too many logged LLM calls this hour.
 * Counts llm_calls (written by the server for every call), so it holds across serverless instances.
 * shortcut: fails open if the admin key is missing or the count query fails; tighten if abuse shows up.
 */
export async function assertLlmBudget(workspaceId: string): Promise<void> {
  const db = adminClient();
  if (!db) return;
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error } = await db.from("llm_calls").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("created_at", since);
  if (error) return console.warn("[budget]", error.message);
  if ((count ?? 0) >= HOURLY()) throw new BudgetError("Your workspace hit its hourly AI limit. Try again in a bit.");
}

/** Editor check + spend cap in one call for AI routes. Throws errors that errorResponse maps to 403/429. */
export async function requireAi(): Promise<Session> {
  const s = await requireEditor();
  await assertLlmBudget(s.workspaceId);
  return s;
}
