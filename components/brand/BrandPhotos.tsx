"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { BrandModel, BrandPhoto } from "@/lib/brand/model";
import { productFromTags } from "@/lib/brand/describe";
import Link from "next/link";
import { uploadBrandImage } from "@/lib/brand/upload-client";
import { dropPathFromProducts, fetchBrandProducts } from "@/lib/catalog/sync-client";

const isProduct = (p: BrandPhoto) => p.role === "product";

/**
 * Grid of the brand's real photos (stored in Supabase), used in product and offer posts.
 * `role` picks which photos show: products (named, used in product carousels) or everything else.
 */
export function PhotoGrid({ model, role, onChange }: { model: BrandModel; role: "product" | "lifestyle"; onChange: (photos: BrandPhoto[]) => void }) {
  const all = model.expression.photos ?? [];
  const shown = all.filter((p) => isProduct(p) === (role === "product"));
  const latest = useRef(all);
  latest.current = all;

  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"upload" | "names" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const key = shown.map((p) => p.path).join("|");
  // Photos that belong to a Catalogue product; their names are edited there.
  const [linked, setLinked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (role !== "product") return;
    fetchBrandProducts(model.id).then((ps) => setLinked(new Set(ps.flatMap((p) => p.imagePaths))));
  }, [role, model.id, key]);
  useEffect(() => {
    const missing = shown.filter((p) => !urls[p.path]);
    if (!missing.length) return;
    const q = missing.map((p) => `path=${encodeURIComponent(p.path)}`).join("&");
    fetch(`/api/brands/${model.id}/photos?${q}`)
      .then((r) => r.json())
      .then((d: { photos?: { path: string; url: string }[] }) => setUrls((u) => ({ ...u, ...Object.fromEntries((d.photos ?? []).map((p) => [p.path, p.url])) })))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, model.id]);

  const patch = (path: string, fn: (p: BrandPhoto) => BrandPhoto) => onChange(latest.current.map((p) => (p.path === path ? fn(p) : p)));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("upload");
    setError(null);
    const added: BrandPhoto[] = [];
    for (const file of [...files].slice(0, 12)) {
      const data = await uploadBrandImage(model.id, file, role === "product" ? "product" : "lifestyle");
      const photo = data.photo;
      if (photo) {
        added.push(role === "product" ? { ...photo, role: "product" } : photo);
        if (data.url) setUrls((u) => ({ ...u, [photo.path]: data.url! }));
      } else setError(data.error ?? "Upload failed");
    }
    const fresh = added.filter((a) => !latest.current.some((p) => p.path === a.path));
    if (fresh.length) onChange([...latest.current, ...fresh]);
    if (role === "product" && fresh.length) {
      setBusy("names");
      try {
        const res = await fetch(`/api/brands/${model.id}/photos/describe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: fresh.map((f) => f.path) }),
        });
        const d = (await res.json().catch(() => ({}))) as { items?: { path: string; productName: string }[] };
        const names = new Map((d.items ?? []).map((i) => [i.path, i.productName]));
        // Only fill names the owner hasn't typed in the meantime.
        onChange(latest.current.map((p) => (names.get(p.path) && !p.product?.name ? { ...p, product: { ...p.product, name: names.get(p.path)! } } : p)));
      } catch {
        // Naming is a convenience; names can be typed.
      }
    }
    setBusy(null);
  };

  const remove = (p: BrandPhoto) => {
    onChange(all.filter((x) => x.path !== p.path));
    if (isProduct(p)) dropPathFromProducts(model.id, p.path);
    fetch(`/api/brands/${model.id}/photos?path=${encodeURIComponent(p.path)}`, { method: "DELETE" }).catch(() => undefined);
  };

  const move = (p: BrandPhoto) => {
    if (isProduct(p)) dropPathFromProducts(model.id, p.path);
    patch(p.path, (x) => {
      if (isProduct(x)) {
        const { role: _role, ...rest } = x;
        void _role;
        return rest;
      }
      return { ...x, role: "product", ...(x.product ? {} : productFromTags(x.tags) ? { product: productFromTags(x.tags) } : {}) };
    });
  };

  const setName = (p: BrandPhoto, name: string) => patch(p.path, (x) => ({ ...x, product: { ...x.product, name } }));

  return (
    <div>
      <div className={role === "product" ? "grid grid-cols-2 sm:grid-cols-4 gap-3" : "grid grid-cols-3 sm:grid-cols-6 gap-2"}>
        {shown.map((p) => (
          <div key={p.path} className="space-y-1.5">
            <div className="relative group aspect-square rounded-lg overflow-hidden bg-surface border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {urls[p.path] && <img src={urls[p.path]} alt={p.product?.name ?? ""} className="w-full h-full object-cover" />}
              <button
                onClick={() => remove(p)}
                aria-label="Remove photo"
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <X size={12} />
              </button>
            </div>
            {role === "product" && linked.has(p.path) && (
              <p className="text-sm truncate">
                {p.product?.name || "Product"}{" "}
                <Link href="/catalog" className="text-xs text-text-muted underline underline-offset-4 hover:text-text">Edit in Catalogue</Link>
              </p>
            )}
            {role === "product" && !linked.has(p.path) && (
              <input
                value={p.product?.name ?? ""}
                onChange={(e) => setName(p, e.target.value)}
                placeholder="Product name"
                aria-label="Product name"
                maxLength={60}
                className="w-full h-8 rounded-md border border-border bg-card px-2 text-sm"
              />
            )}
            <button onClick={() => move(p)} className="text-xs text-text-muted hover:text-text underline-offset-4 hover:underline">
              {role === "product" ? "Move to other photos" : "Move to products"}
            </button>
          </div>
        ))}
        <button
          onClick={() => input.current?.click()}
          disabled={busy === "upload"}
          className="aspect-square rounded-lg border-2 border-dashed border-border text-text-muted hover:text-text hover:border-text/30 flex flex-col items-center justify-center gap-1 text-xs"
        >
          <Plus size={16} />
          {busy === "upload" ? "Uploading…" : role === "product" ? "Add products" : "Add photos"}
        </button>
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      {busy === "names" && <p className="text-xs text-text-muted mt-2">Suggesting names…</p>}
      {error && <p className="text-xs text-error mt-2">{error}</p>}
      {!shown.length && (
        <p className="text-xs text-text-muted mt-2">
          {role === "product" ? "Add a photo of each product. Carousel posts show one product per slide." : "Add team or place photos. Posts use these instead of AI images."}
        </p>
      )}
    </div>
  );
}
