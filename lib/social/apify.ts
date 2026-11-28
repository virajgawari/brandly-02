import "server-only";
import type { SocialPost } from "./types";

const BASE = "https://api.apify.com/v2";
export const MAX_POSTS = 30;
export const MAX_COST_USD = 0.5;

const token = () => process.env.APIFY_TOKEN;
const actor = () => (process.env.APIFY_IG_ACTOR ?? "apify~instagram-scraper").replace("/", "~");

export const apifyEnabled = () => Boolean(token());

export function cleanHandle(input: string): string {
  const m = input.trim().match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  return (m ? m[1] : input).replace(/^@/, "").replace(/\/$/, "");
}

const num = (v: unknown): number => (typeof v === "number" && v > 0 ? v : 0);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Cut one raw actor item down to the fields we keep. Returns null when it has no id. */
export function mapItem(raw: Record<string, unknown>): SocialPost | null {
  const id = String(raw.shortCode ?? raw.id ?? "");
  if (!id) return null;
  const t = String(raw.type ?? "").toLowerCase();
  const children = Array.isArray(raw.childPosts) ? (raw.childPosts as Record<string, unknown>[]) : [];
  const type: SocialPost["type"] =
    t.includes("video") || raw.videoUrl ? "video" : t.includes("sidecar") || children.length > 1 ? "carousel" : "image";
  const first = [raw.displayUrl, ...children.slice(0, 2).map((c) => c.displayUrl)].filter(
    (u): u is string => typeof u === "string",
  );
  return {
    externalId: id,
    timestamp: typeof raw.timestamp === "string" ? raw.timestamp : new Date().toISOString(),
    type,
    caption: typeof raw.caption === "string" ? raw.caption : "",
    hashtags: strs(raw.hashtags).map((h) => (h.startsWith("#") ? h : `#${h}`)),
    mentions: strs(raw.mentions).map((m) => (m.startsWith("@") ? m : `@${m}`)),
    likes: num(raw.likesCount),
    comments: num(raw.commentsCount),
    views: num(raw.videoViewCount ?? raw.videoPlayCount),
    mediaUrls: Array.from(new Set(first)),
    isSponsored: raw.isSponsored === true,
  };
}

/** Start a scrape run. Posts only, comments off, hard cost cap. Returns the run id. */
export async function startScrape(handle: string, limit = MAX_POSTS): Promise<string> {
  const res = await fetch(`${BASE}/acts/${actor()}/runs?token=${token()}&maxTotalChargeUsd=${MAX_COST_USD}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      directUrls: [`https://www.instagram.com/${cleanHandle(handle)}/`],
      resultsType: "posts",
      resultsLimit: Math.min(limit, MAX_POSTS),
      addParentData: false,
    }),
  });
  if (!res.ok) throw new Error(`apify start failed: ${res.status}`);
  const json = (await res.json()) as { data?: { id?: string } };
  if (!json.data?.id) throw new Error("apify start returned no run id");
  return json.data.id;
}

export type RunState =
  | { status: "running" }
  | { status: "failed"; reason: string }
  | { status: "done"; posts: SocialPost[] };

/** Check a run; fetch and map the dataset once it has succeeded. */
export async function pollScrape(runId: string): Promise<RunState> {
  const r = await fetch(`${BASE}/actor-runs/${runId}?token=${token()}`);
  if (!r.ok) throw new Error(`apify poll failed: ${r.status}`);
  const run = ((await r.json()) as { data?: { status?: string; defaultDatasetId?: string } }).data ?? {};
  if (run.status === "SUCCEEDED" && run.defaultDatasetId) {
    const d = await fetch(`${BASE}/datasets/${run.defaultDatasetId}/items?token=${token()}&clean=true&limit=${MAX_POSTS}`);
    if (!d.ok) throw new Error(`apify dataset failed: ${d.status}`);
    const items = (await d.json()) as Record<string, unknown>[];
    return { status: "done", posts: items.map(mapItem).filter((p): p is SocialPost => p !== null) };
  }
  if (["FAILED", "ABORTED", "TIMED-OUT"].includes(run.status ?? "")) return { status: "failed", reason: run.status ?? "unknown" };
  return { status: "running" };
}
