"use client";
import { useEffect, useState } from "react";
import { Heart } from "lucide-react";

interface Ref {
  id: string;
  caption: string;
  likes: number;
  type: string | null;
  imageUrl: string | null;
}

const cache = new Map<string, Ref[]>();

/** While an image is being made: the brand's real top posts it is studying, scrolling slowly upward. */
export default function ReferenceScroll({ brandId }: { brandId: string }) {
  const [refs, setRefs] = useState<Ref[]>(cache.get(brandId) ?? []);

  useEffect(() => {
    if (cache.has(brandId)) return;
    let live = true;
    fetch(`/api/brands/${encodeURIComponent(brandId)}/social`)
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((j: { posts?: Ref[] }) => {
        const list = (j.posts ?? []).filter((p) => p.imageUrl);
        cache.set(brandId, list);
        if (live) setRefs(list);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [brandId]);

  if (!refs.length) {
    return (
      <div className="w-full max-w-xs space-y-2 animate-pulse" aria-hidden>
        <div className="h-2 rounded bg-text/10" />
        <div className="h-2 rounded bg-text/10 w-4/5 mx-auto" />
        <div className="h-2 rounded bg-text/10 w-3/5 mx-auto" />
      </div>
    );
  }

  const list = [...refs, ...refs]; // doubled so the loop is seamless
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <p className="text-[11px] text-text-muted">Studying your best posts</p>
      <div
        className="relative h-80 w-52 overflow-hidden rounded-xl"
        style={{ maskImage: "linear-gradient(transparent, #000 15%, #000 85%, transparent)", WebkitMaskImage: "linear-gradient(transparent, #000 15%, #000 85%, transparent)" }}
        aria-hidden
      >
        <div className="flex flex-col gap-2" style={{ animation: `refScroll ${Math.max(12, refs.length * 4)}s linear infinite` }}>
          {list.map((r, i) => (
            <div key={`${r.id}-${i}`} className="overflow-hidden rounded-lg border border-border bg-surface text-left">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.imageUrl!} alt="" className="aspect-square w-full object-cover" />
              <p className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-muted">
                <Heart size={10} />
                {r.likes >= 1000 ? `${Math.round(r.likes / 1000)}k` : r.likes}
                {r.type && <span className="ml-auto capitalize">{r.type}</span>}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
