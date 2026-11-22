import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadAsJpeg } from "@/lib/render/assets";
import type { ScoredPost } from "./types";

const TOP_IMAGES = 12;

/**
 * SECURITY: callers pass either the user's RLS client or the service-role client. Every query
 * here filters by workspaceId, so it is safe with the service role too.
 */
type Client = SupabaseClient;

/** Copies one image per top post into the `images` bucket; returns the storage paths by post id. */
async function storeTopImages(db: Client, workspaceId: string, brandId: string, posts: ScoredPost[]) {
  const paths = new Map<string, string[]>();
  const top = posts.filter((p) => p.isTop).slice(0, TOP_IMAGES);
  for (let i = 0; i < top.length; i += 4) {
    await Promise.all(
      top.slice(i, i + 4).map(async (p) => {
        const url = p.mediaUrls[0];
        if (!url) return;
        const img = await downloadAsJpeg(url, 1280);
        if (!img) return;
        const path = `${workspaceId}/brands/${brandId}/social/${p.externalId}.jpg`;
        const { error } = await db.storage.from("images").upload(path, img.buf, { contentType: "image/jpeg", upsert: true });
        if (!error) paths.set(p.externalId, [path]);
      }),
    );
  }
  return paths;
}

/** Saves scored posts (and copies of the top images) for a brand. Returns how many rows were written. */
export async function saveSocialPosts(db: Client, workspaceId: string, brandId: string, posts: ScoredPost[]): Promise<number> {
  const stored = await storeTopImages(db, workspaceId, brandId, posts);
  const rows = posts.map((p) => ({
    workspace_id: workspaceId,
    brand_id: brandId,
    platform: "instagram",
    external_id: p.externalId,
    posted_at: p.timestamp,
    type: p.type,
    caption: p.caption,
    hashtags: p.hashtags,
    mentions: p.mentions,
    likes: p.likes,
    comments: p.comments,
    views: p.views,
    media_urls: p.mediaUrls,
    stored_paths: stored.get(p.externalId) ?? [],
    engagement_score: p.engagementScore,
    is_top: p.isTop,
  }));
  if (!rows.length) return 0;
  const { error } = await db.from("social_posts").upsert(rows, { onConflict: "brand_id,platform,external_id" });
  if (error) throw new Error(`Couldn't save scraped posts: ${error.message}`);
  return rows.length;
}

/** Posts and base64 top images for the `social` pipeline. Empty when nothing was scraped. */
export async function loadSocialInput(db: Client, workspaceId: string, brandId: string) {
  const { data, error } = await db
    .from("social_posts")
    .select("external_id, posted_at, type, caption, hashtags, mentions, likes, comments, views, media_urls, stored_paths, engagement_score, is_top")
    .eq("workspace_id", workspaceId)
    .eq("brand_id", brandId)
    .order("engagement_score", { ascending: false })
    .limit(50);
  if (error) throw error;
  const socialPosts: ScoredPost[] = (data ?? []).map((r) => ({
    externalId: r.external_id,
    timestamp: r.posted_at ?? "",
    type: r.type,
    caption: r.caption,
    hashtags: r.hashtags ?? [],
    mentions: r.mentions ?? [],
    likes: r.likes,
    comments: r.comments,
    views: r.views,
    mediaUrls: r.media_urls ?? [],
    engagementScore: Number(r.engagement_score),
    isTop: r.is_top,
  }));
  const paths = (data ?? []).filter((r) => r.is_top).flatMap((r) => (r.stored_paths ?? []).slice(0, 1)).slice(0, TOP_IMAGES);
  const socialImages: string[] = [];
  for (const path of paths) {
    const { data: blob } = await db.storage.from("images").download(path);
    if (blob) socialImages.push(Buffer.from(await blob.arrayBuffer()).toString("base64"));
  }
  return { socialPosts, socialImages };
}

export interface TopPostView {
  id: string;
  type: string | null;
  caption: string;
  likes: number;
  comments: number;
  postedAt: string | null;
  imageUrl: string | null;
}

/** Counts and top posts (with signed image URLs) for the brand page. */
export async function listTopSocialPosts(db: Client, workspaceId: string, brandId: string): Promise<{ count: number; posts: TopPostView[] }> {
  const { count } = await db
    .from("social_posts")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("brand_id", brandId);
  const { data } = await db
    .from("social_posts")
    .select("external_id, type, caption, likes, comments, posted_at, media_urls, stored_paths")
    .eq("workspace_id", workspaceId)
    .eq("brand_id", brandId)
    .eq("is_top", true)
    .order("engagement_score", { ascending: false })
    .limit(10);
  const posts = await Promise.all(
    (data ?? []).map(async (r): Promise<TopPostView> => {
      const path = (r.stored_paths ?? [])[0] as string | undefined;
      let imageUrl: string | null = null;
      if (path) {
        const { data: signed } = await db.storage.from("images").createSignedUrl(path, 3600);
        imageUrl = signed?.signedUrl ?? null;
      }
      return {
        id: r.external_id,
        type: r.type,
        caption: String(r.caption ?? "").slice(0, 280),
        likes: r.likes ?? 0,
        comments: r.comments ?? 0,
        postedAt: r.posted_at,
        imageUrl,
      };
    }),
  );
  return { count: count ?? 0, posts };
}

/** Storage paths of the brand's best scraped images, for use as Muse style references. */
export async function topStylePaths(db: Client, workspaceId: string, brandId: string, n = 3): Promise<string[]> {
  const { data } = await db
    .from("social_posts")
    .select("stored_paths")
    .eq("workspace_id", workspaceId)
    .eq("brand_id", brandId)
    .eq("is_top", true)
    .order("engagement_score", { ascending: false })
    .limit(n * 2);
  return (data ?? []).flatMap((r) => (r.stored_paths ?? []).slice(0, 1)).slice(0, n);
}
