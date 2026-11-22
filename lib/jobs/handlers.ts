import "server-only";

// Job handlers, keyed by `kind`. Add new kinds here.
//
// SECURITY: handlers run with the service-role client, which bypasses RLS. Every query a
// handler makes MUST filter by job.workspace_id, and must not trust ids in the payload
// without checking they belong to that workspace.

export interface JobRow {
  id: string;
  kind: string;
  workspace_id: string;
  brand_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  created_by: string | null;
}

export type JobHandler = (job: JobRow) => Promise<unknown>;

const POLL_MS = 4_000;
const POLL_BUDGET_MS = 30_000;

/** Scrapes a brand's Instagram with Apify. The run id is saved on the job so a retry never starts (and pays for) a second run. */
async function socialScrape(job: JobRow) {
  const { startScrape, pollScrape, MAX_POSTS } = await import("@/lib/social/apify");
  const { triage } = await import("@/lib/social/triage");
  const { saveSocialPosts } = await import("@/lib/social/store");
  const { adminClient } = await import("@/lib/supabase/admin");
  const db = adminClient();
  if (!db) throw new Error("social.scrape needs SUPABASE_SECRET_KEY.");
  if (!job.brand_id) throw new Error("social.scrape needs a brand.");
  // The brand must belong to the job's workspace; never trust ids in the payload.
  const { data: brand } = await db.from("brands").select("id").eq("id", job.brand_id).eq("workspace_id", job.workspace_id).maybeSingle();
  if (!brand) throw new Error("Brand not found in this workspace.");

  let runId = typeof job.payload.runId === "string" ? job.payload.runId : undefined;
  if (!runId) {
    const handle = typeof job.payload.handle === "string" ? job.payload.handle : "";
    if (!handle) throw new Error("social.scrape needs an Instagram handle.");
    runId = await startScrape(handle);
    await db.from("jobs").update({ payload: { ...job.payload, runId, startedAt: new Date().toISOString() } }).eq("id", job.id).eq("workspace_id", job.workspace_id);
  }

  const until = Date.now() + POLL_BUDGET_MS;
  for (;;) {
    const state = await pollScrape(runId);
    if (state.status === "failed") throw new Error(`Instagram scrape ${state.reason.toLowerCase()}.`);
    if (state.status === "done") {
      const followers = typeof job.payload.followers === "number" ? job.payload.followers : undefined;
      const scored = triage(state.posts, followers);
      const saved = await saveSocialPosts(db, job.workspace_id, job.brand_id, scored);
      const startedAt = typeof job.payload.startedAt === "string" ? Date.parse(job.payload.startedAt) : NaN;
      return {
        runId,
        handle: job.payload.handle,
        followers,
        limit: MAX_POSTS,
        fetched: state.posts.length,
        posts: saved,
        top: scored.filter((p) => p.isTop).length,
        types: Object.fromEntries(["image", "carousel", "video", "text"].map((t) => [t, state.posts.filter((p) => p.type === t).length])),
        durationMs: Number.isFinite(startedAt) ? Date.now() - startedAt : undefined,
      };
    }
    if (Date.now() + POLL_MS > until) throw new Error("Instagram scrape is still running."); // queue retries with backoff
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export const HANDLERS: Record<string, JobHandler> = {
  "social.scrape": socialScrape,
  // Used by tests: returns its payload, or throws when payload.fail is true.
  "test.echo": async (job) => {
    if (job.payload.fail === true) throw new Error("test.echo asked to fail");
    return job.payload;
  },
};
