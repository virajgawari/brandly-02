"use client";
import type { ScheduledPost } from "@/lib/types";
import { PLATFORM_LABELS } from "@/lib/templates";

const STATUS: Record<string, string> = { draft: "Saved", scheduled: "Scheduled", published: "Published", failed: "Failed" };

/** One saved AI-generated post: image, caption excerpt, platforms, status. */
export default function SavedPostCard({ post, onDelete }: { post: ScheduledPost; onDelete: (id: string) => void }) {
  const image = post.mediaUrl ?? post.content.rendered?.urls?.[0];
  const text = post.content.headline ? `${post.content.headline}` : post.content.caption;
  return (
    <li className="rounded-3xl border border-border/70 bg-card overflow-hidden flex flex-col shadow-card">
      <div className="aspect-[4/5] bg-text/5 overflow-hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="w-full h-full object-cover" />
        ) : (
          <p className="p-5 text-sm text-text-muted line-clamp-[12]">{post.content.caption}</p>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col gap-3">
        <p className="text-sm font-medium line-clamp-2">{text}</p>
        <p className="text-xs text-text-muted line-clamp-2">{post.content.caption}</p>
        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-text/5 font-medium">{STATUS[post.status] ?? post.status}</span>
            {post.platforms.map((p) => (
              <span key={p} className="text-[11px] px-2.5 py-1 rounded-full border border-border text-text-muted">{PLATFORM_LABELS[p]}</span>
            ))}
          </div>
          <button onClick={() => onDelete(post.id)} aria-label="Delete saved post" className="text-xs text-text-muted hover:text-error">Delete</button>
        </div>
        <p className="text-[11px] text-text-muted">{new Date(post.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p>
      </div>
    </li>
  );
}
