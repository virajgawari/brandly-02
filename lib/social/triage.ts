import type { ScoredPost, SocialPost } from "./types";

export const TOP_N = 10;

/** Engagement of one post: likes + comments, or views for video (views are a different scale, so they are weighted down). */
export function engagementOf(p: SocialPost): number {
  if (p.type === "video" && p.views > 0) return p.views * 0.1 + p.likes + p.comments;
  return p.likes + p.comments;
}

/** Drop duplicates, ads, reposts and empty posts; score the rest; tag the top N. Best first. */
export function triage(posts: SocialPost[], followers?: number, topN = TOP_N): ScoredPost[] {
  const seen = new Set<string>();
  const kept: SocialPost[] = [];
  for (const p of posts) {
    if (!p.externalId || seen.has(p.externalId)) continue;
    seen.add(p.externalId);
    if (p.isSponsored || p.isRepost) continue;
    if (!p.caption.trim() && p.mediaUrls.length === 0) continue;
    kept.push(p);
  }
  const scale = followers && followers > 0 ? 1000 / followers : 1;
  const scored = kept
    .map((p) => ({ ...p, engagementScore: Math.round(engagementOf(p) * scale * 100) / 100, isTop: false }))
    .sort((a, b) => b.engagementScore - a.engagementScore);
  scored.slice(0, topN).forEach((p) => (p.isTop = true));
  return scored;
}
