import type { GeneratedPost, PostVersion } from "@/lib/types";

export const MAX_VERSIONS = 5;

/** Puts a snapshot of `post` at the front of its history (newest first), dropping the oldest past MAX_VERSIONS. */
export function pushVersion(post: GeneratedPost, at: string = new Date().toISOString()): PostVersion[] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { versions, rendered, ...snapshot } = post;
  return [{ at, post: snapshot }, ...(versions ?? [])].slice(0, MAX_VERSIONS);
}

/** Brings an earlier draft back. The current draft is kept in the history so nothing is lost. */
export function restoreVersion(post: GeneratedPost, index: number): GeneratedPost {
  const target = post.versions?.[index];
  if (!target) return post;
  const rest = (post.versions ?? []).filter((_, i) => i !== index);
  return { ...target.post, versions: pushVersion({ ...post, versions: rest }) };
}
