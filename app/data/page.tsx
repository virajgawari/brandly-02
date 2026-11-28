"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera, Heart, MessageCircle } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Card, Chip, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { useStore } from "@/lib/store";

interface Post {
  id: string;
  type: string | null;
  caption: string;
  likes: number;
  comments: number;
  views: number;
  postedAt: string | null;
  hashtags: string[];
  score: number;
  isTop: boolean;
  images: string[];
  imageUrl: string | null;
}

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

/** Everything scraped from the brand's Instagram. The composer reads these (top captions, style images, playbook). */
export default function DataPage() {
  const brand = useStore((s) => s.getActiveBrand());
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<Post | null>(null);
  const brandId = brand?.id;

  useEffect(() => {
    if (!brandId) return;
    let live = true;
    setPosts(null);
    fetch(`/api/brands/${encodeURIComponent(brandId)}/social?all=1`)
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((j: { posts?: Post[] }) => live && setPosts(j.posts ?? []))
      .catch(() => live && setPosts([]));
    return () => {
      live = false;
    };
  }, [brandId]);

  const types = useMemo(() => [...new Set((posts ?? []).map((p) => p.type).filter(Boolean))] as string[], [posts]);
  const shown = (posts ?? []).filter((p) => (filter === "all" ? true : filter === "top" ? p.isTop : p.type === filter));
  const total = posts?.length ?? 0;
  const avg = (k: "likes" | "comments") => (total ? Math.round((posts ?? []).reduce((a, p) => a + p[k], 0) / total) : 0);
  const playbook = brand?.model?.voice.playbook;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <PageHeader
          title="Data"
          subtitle={brand ? `Posts scraped from ${brand.sources.instagram ? "@" + brand.sources.instagram : "your Instagram"}. The AI uses these when it writes and designs new posts.` : ""}
          action={<Link href="/brand" className="text-sm underline underline-offset-4 text-text-muted hover:text-text">Re-scrape in Brand</Link>}
        />
        {posts === null ? (
          <div className="flex justify-center py-20"><Spinner size={20} /></div>
        ) : total === 0 ? (
          <EmptyState
            icon={<Camera size={28} />}
            title="No scraped posts yet"
            description="Add your Instagram handle in Brand and run Instagram learning. The posts, images and stats will appear here."
            action={<Link href="/brand" className="text-sm underline underline-offset-4">Go to Brand</Link>}
          />
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Posts scraped", String(total)],
                ["Best performers", String(posts.filter((p) => p.isTop).length)],
                ["Avg likes", fmt(avg("likes"))],
                ["Avg comments", fmt(avg("comments"))],
              ].map(([k, v]) => (
                <Card key={k} className="p-4"><p className="text-xs text-text-muted">{k}</p><p className="mt-1 text-2xl font-semibold">{v}</p></Card>
              ))}
            </div>

            {playbook && (
              <Card className="mt-4 p-4 text-sm">
                <p className="font-medium">What the AI learned from these</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-text-muted">
                  {playbook.adjectives?.length ? <li>Sounds: {playbook.adjectives.slice(0, 5).join(", ")}</li> : null}
                  {playbook.cta ? <li>Closing: {playbook.cta}</li> : null}
                  {playbook.hashtagRule ? <li>Hashtags: {playbook.hashtagRule}</li> : null}
                  {playbook.neverSoundsLike ? <li>Never sounds like: {playbook.neverSoundsLike}</li> : null}
                  <li>{playbook.anchors?.length ?? 0} top captions are shown to the writer as examples; the best images guide photo style.</li>
                </ul>
              </Card>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              {["all", "top", ...types].map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-sm ${filter === f ? "bg-text text-bg border-text" : "border-border text-text-muted hover:text-text"}`}>
                  {f === "all" ? "All" : f === "top" ? "Best performers" : f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {shown.map((p) => (
                <button key={p.id} onClick={() => setOpen(p)} className="group overflow-hidden rounded-2xl border border-border bg-surface text-left transition hover:shadow-md">
                  <div className="relative aspect-square bg-black/5">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-text-muted">No image saved</div>
                    )}
                    {p.isTop && <span className="absolute left-2 top-2"><Chip>Top</Chip></span>}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm">{p.caption || "No caption"}</p>
                    <p className="mt-2 flex items-center gap-3 text-xs text-text-muted">
                      <span className="flex items-center gap-1"><Heart size={12} />{fmt(p.likes)}</span>
                      <span className="flex items-center gap-1"><MessageCircle size={12} />{fmt(p.comments)}</span>
                      {p.type && <span className="ml-auto capitalize">{p.type}</span>}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {open && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setOpen(null)}>
            <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-bg p-5" onClick={(e) => e.stopPropagation()}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  {open.images.length ? (
                    open.images.map((u) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={u} src={u} alt="" referrerPolicy="no-referrer" className="w-full rounded-xl" />
                    ))
                  ) : (
                    <p className="text-sm text-text-muted">No image saved for this post.</p>
                  )}
                </div>
                <div className="text-sm">
                  <p className="whitespace-pre-wrap">{open.caption || "No caption"}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-2 text-text-muted">
                    <dt>Likes</dt><dd>{open.likes.toLocaleString()}</dd>
                    <dt>Comments</dt><dd>{open.comments.toLocaleString()}</dd>
                    {open.views > 0 && (<><dt>Views</dt><dd>{open.views.toLocaleString()}</dd></>)}
                    <dt>Type</dt><dd className="capitalize">{open.type ?? "-"}</dd>
                    <dt>Posted</dt><dd>{open.postedAt ? new Date(open.postedAt).toLocaleDateString() : "-"}</dd>
                    <dt>Score</dt><dd>{open.score.toFixed(2)}</dd>
                  </dl>
                  {open.hashtags.length > 0 && <p className="mt-3 text-text-muted">{open.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>}
                  <button onClick={() => setOpen(null)} className="mt-4 rounded-lg border border-border px-3 py-1.5">Close</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
