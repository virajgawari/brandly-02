import "server-only";
import { postFromRow, POST_SELECT, type PostRow } from "@/lib/db/mappers";
import { postizKeyFor, publishWithPostiz, type PublishResult } from "@/lib/postiz";
import { signPaths } from "@/lib/render/media";
import { adminClient } from "@/lib/supabase/admin";
import type { Platform } from "@/lib/types";

export type PublishOutcome = { status: "published" | "partial" | "failed" | "skipped"; results: PublishResult[]; error?: string };

const CLAIM_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;

/** Exponential backoff between publish attempts: 1 min, 2 min, 4 min… (same shape as the jobs queue, kept local so this file stays light). */
export function backoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
}

/** True when every failed result looks like a temporary upstream problem (rate limit, 5xx, network), so a retry may succeed. */
export function isTransientFailure(results: PublishResult[]): boolean {
  const failed = results.filter((r) => !r.ok);
  if (!failed.length) return false;
  return failed.every((r) => /\bPostiz (429|5\d\d)\b|fetch failed|timed? ?out|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(r.error ?? ""));
}

/**
 * Publishes a stored post now: the one place that posts anything (Publish now and the due-post cron both use it).
 * Reads the post from the database (never from a request), claims it so two runs can't double-post,
 * only posts to platforms that haven't succeeded yet, and records the outcome per platform.
 * The caller must already have checked that the user may publish in `workspaceId`.
 */
export async function publishPost(workspaceId: string, postId: string): Promise<PublishOutcome> {
  const db = adminClient();
  if (!db) return { status: "failed", results: [], error: "Publishing needs SUPABASE_SECRET_KEY." };
  const key = await postizKeyFor(workspaceId);
  if (!key) return { status: "failed", results: [], error: "Publishing isn't connected for this workspace. Add a Postiz key in Settings." };

  const stale = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
  const { data: claimed, error: claimErr } = await db
    .from("posts")
    .update({ publish_claimed_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("workspace_id", workspaceId)
    .in("status", ["draft", "scheduled", "failed"])
    .or(`publish_claimed_at.is.null,publish_claimed_at.lt.${stale}`)
    .select(POST_SELECT)
    .maybeSingle();
  if (claimErr) throw claimErr;
  if (!claimed) return { status: "skipped", results: [], error: "Already published, being published, or not found." };

  const post = postFromRow(claimed as unknown as PostRow);
  try {
    const { data: done } = await db.from("post_publications").select("platform").eq("post_id", postId).eq("status", "published");
    const have = new Set((done ?? []).map((d) => d.platform as string));
    const todo = post.platforms.filter((p) => !have.has(p));

    let outcome: PublishOutcome = { status: "published", results: [] };
    if (todo.length) {
      const paths = post.content.rendered?.paths;
      // Branded images live in private storage: sign fresh links so Postiz can fetch them.
      const mediaUrls = paths?.length ? await signPaths({ db }, "images", paths, 60 * 60 * 24 * 7).catch(() => undefined) : undefined;
      const out = await publishWithPostiz({ key, post, platforms: todo, mediaUrls, includeExtra: have.size === 0 });
      const rows = out.results
        .filter((r): r is PublishResult & { channel: Platform } => !!r.channel)
        .map((r) => ({
          post_id: postId,
          workspace_id: workspaceId,
          platform: r.channel,
          external_id: r.id ?? null,
          status: r.ok ? "published" : "failed",
          error: r.error ?? null,
          published_at: r.ok ? new Date().toISOString() : null,
        }));
      if (rows.length) {
        const { error } = await db.from("post_publications").insert(rows);
        if (error) console.warn("[publish] couldn't record publications", error.message);
      }
      outcome = { status: out.status, results: out.results };
    }

    const ok = outcome.status === "published";
    // Transient upstream failures (429/5xx/network) on a scheduled post: stay scheduled and back off instead of dropping it.
    const { data: meta } = await db.from("posts").select("publish_attempts").eq("id", postId).maybeSingle();
    const attempts = ((meta?.publish_attempts as number | undefined) ?? 0) + 1;
    const retry = !ok && claimed.status === "scheduled" && attempts < MAX_ATTEMPTS && isTransientFailure(outcome.results);
    await db
      .from("posts")
      .update(
        ok
          ? { status: "published", published_at: new Date().toISOString(), publish_attempts: 0, next_publish_at: null }
          : retry
            ? { status: "scheduled", publish_attempts: attempts, next_publish_at: new Date(Date.now() + backoffMs(attempts)).toISOString() }
            : { status: "failed", publish_attempts: attempts, next_publish_at: null }
      )
      .eq("id", postId);
    if (ok) await db.from("content_events").insert({ post_id: postId, workspace_id: workspaceId, event: "published" });
    return outcome;
  } catch (err) {
    await db.from("posts").update({ status: "failed" }).eq("id", postId);
    return { status: "failed", results: [], error: err instanceof Error ? err.message : String(err) };
  } finally {
    await db.from("posts").update({ publish_claimed_at: null }).eq("id", postId);
  }
}
