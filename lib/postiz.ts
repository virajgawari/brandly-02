import type { Platform, ScheduledPost } from "@/lib/types";
import { adminClient } from "@/lib/supabase/admin";

// Publishes Brandly posts through a Postiz instance (self-hosted or cloud).
// Social accounts are connected inside Postiz ("channels"); Brandly only needs an API key.
//
//   POSTIZ_API_URL   e.g. http://localhost:4007/api/public/v1  (cloud: https://api.postiz.com/public/v1)
//   POSTIZ_API_KEY   Postiz → Settings → Developers → Public API key. Belongs to ONE workspace (POSTIZ_WORKSPACE_ID);
//                    every other workspace stores its own key in workspace_secrets (Settings → Publishing).
//                    Outside production, an unset POSTIZ_WORKSPACE_ID lets any workspace use it (local dev).
//   POSTIZ_ALSO_POST_TO  optional, comma-separated Postiz identifiers (e.g. "bluesky") that receive
//                        every post too. Meant for testing with platforms that need no developer app.

export type PublishResult = { platform: string; /** Set when the result belongs to one of the post's own platforms. */ channel?: Platform; ok: boolean; id?: string | null; error?: string };

type Integration = { id: string; name: string; identifier: string; disabled?: boolean };

// Brandly platform → Postiz provider identifiers that count as that platform.
const IDENTIFIERS: Record<Platform, string[]> = {
  instagram: ["instagram", "instagram-standalone"],
  facebook: ["facebook"],
  linkedin: ["linkedin", "linkedin-page"],
  twitter: ["x"],
};

// Minimal per-provider settings Postiz requires (`__type` must match the identifier).
function settingsFor(identifier: string): Record<string, unknown> {
  if (identifier === "x") return { __type: "x", who_can_reply_post: "everyone" };
  if (identifier.startsWith("instagram")) return { __type: identifier, post_type: "post" };
  return { __type: identifier };
}

const LIMITS: Record<string, number> = { x: 280, bluesky: 300, threads: 500, mastodon: 500 };

/** The Postiz API key this workspace may publish with, or null. Never falls back to another workspace's key. */
export async function postizKeyFor(workspaceId: string): Promise<string | null> {
  if (!process.env.POSTIZ_API_URL) return null;
  const { data } = (await adminClient()?.from("workspace_secrets").select("postiz_api_key").eq("workspace_id", workspaceId).maybeSingle()) ?? {};
  if (data?.postiz_api_key) return data.postiz_api_key as string;
  const env = process.env.POSTIZ_API_KEY;
  if (!env) return null;
  const owner = process.env.POSTIZ_WORKSPACE_ID;
  return owner ? (owner === workspaceId ? env : null) : process.env.NODE_ENV === "production" ? null : env;
}

async function postiz<T>(key: string, path: string, init: RequestInit = {}): Promise<T> {
  const base = process.env.POSTIZ_API_URL!.replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: key,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const msg = (data as { message?: unknown })?.message ?? text;
    throw new Error(`Postiz ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  return data as T;
}

export function listChannels(key: string): Promise<Integration[]> {
  return postiz<Integration[]>(key, "/integrations");
}

function captionFor(post: ScheduledPost, platform: Platform | null, identifier: string): string {
  const c = post.content;
  const tags = (c.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  let text = (platform && c.platformVariants?.[platform]) || [c.caption, tags].filter(Boolean).join("\n\n");
  const limit = LIMITS[identifier];
  if (limit && text.length > limit) text = text.slice(0, limit - 1) + "…";
  return text;
}

/** Publishes now to `platforms` only (callers pass just the ones not yet published). */
export async function publishWithPostiz(opts: {
  key: string;
  post: ScheduledPost;
  platforms: Platform[];
  mediaUrls?: string[];
  /** Also post to POSTIZ_ALSO_POST_TO test channels (first publish only). */
  includeExtra?: boolean;
}): Promise<{ status: "published" | "partial" | "failed"; results: PublishResult[] }> {
  const { post, key } = opts;
  const channels = (await listChannels(key)).filter((c) => !c.disabled);
  const results: PublishResult[] = [];
  const targets: { label: string; platform: Platform | null; channel: Integration }[] = [];

  for (const p of opts.platforms) {
    const matches = channels.filter((c) => IDENTIFIERS[p]?.includes(c.identifier));
    if (!matches.length) results.push({ platform: p, channel: p, ok: false, error: "No connected channel in Postiz" });
    for (const channel of matches) targets.push({ label: `${p} (${channel.name})`, platform: p, channel });
  }
  const extra = (opts.includeExtra ? process.env.POSTIZ_ALSO_POST_TO ?? "" : "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const id of extra) {
    const matches = channels.filter((c) => c.identifier === id);
    if (!matches.length) results.push({ platform: id, ok: false, error: "No connected channel in Postiz" });
    for (const channel of matches) targets.push({ label: `${id} (${channel.name})`, platform: null, channel });
  }

  if (!targets.length) return { status: "failed", results };

  // Postiz needs media in its own storage; copy any image URLs over first.
  const urls = (opts.mediaUrls ?? (post.mediaUrl ? [post.mediaUrl] : [])).filter((u) => /^https?:\/\//i.test(u));
  const images: { id: string; path: string }[] = [];
  for (const url of urls) {
    try {
      const up = await postiz<{ id: string; path: string }>(key, "/upload-from-url", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      images.push({ id: up.id, path: up.path });
    } catch (err) {
      console.error("[postiz] media upload failed", err);
    }
  }

  // One request per channel, so one bad channel doesn't fail the rest.
  for (const t of targets) {
    if (t.channel.identifier.startsWith("instagram") && !images.length) {
      results.push({ platform: t.label, channel: t.platform ?? undefined, ok: false, error: "Instagram needs an image (mediaUrl)" });
      continue;
    }
    try {
      const res = await postiz<unknown>(key, "/posts", {
        method: "POST",
        body: JSON.stringify({
          type: "now",
          date: new Date().toISOString(),
          shortLink: false,
          tags: [],
          posts: [
            {
              integration: { id: t.channel.id },
              value: [{ content: captionFor(post, t.platform, t.channel.identifier), image: images }],
              settings: settingsFor(t.channel.identifier),
            },
          ],
        }),
      });
      const first = Array.isArray(res) ? (res[0] as { postId?: string }) : undefined;
      results.push({ platform: t.label, channel: t.platform ?? undefined, ok: true, id: first?.postId ?? null });
    } catch (err) {
      results.push({ platform: t.label, channel: t.platform ?? undefined, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const status = okCount === 0 ? "failed" : okCount < results.length ? "partial" : "published";
  return { status, results };
}
