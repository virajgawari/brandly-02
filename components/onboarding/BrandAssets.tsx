"use client";
import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { BrandPhoto } from "@/lib/brand/model";

export interface LogoAsset {
  path: string;
  url: string;
  /** data: URI of the uploaded file, sent to the pipeline so colours are measured from it. */
  dataUri: string;
}
export interface ProductAsset {
  path: string;
  url: string;
  name: string;
}

export const MAX_PRODUCTS = 12;

export const productsToPhotos = (products: ProductAsset[]): BrandPhoto[] =>
  products.map((p) => ({
    path: p.path,
    source: "upload" as const,
    addedAt: new Date().toISOString(),
    role: "product" as const,
    ...(p.name.trim() ? { product: { name: p.name.trim() } } : {}),
  }));

const readDataUri = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file"));
    r.readAsDataURL(file);
  });

async function post(brandId: string, file: File, role: "logo" | "product") {
  const form = new FormData();
  form.append("file", file);
  form.append("role", role);
  const res = await fetch(`/api/brands/${brandId}/photos`, { method: "POST", body: form });
  return (await res.json().catch(() => ({}))) as { photo?: BrandPhoto; logoPath?: string; url?: string; error?: string };
}

/** Onboarding step: upload a logo and product photos. Both are optional. */
export function BrandAssets({
  brandId,
  logo,
  onLogo,
  products,
  onProducts,
}: {
  brandId: string;
  logo: LogoAsset | null;
  onLogo: (l: LogoAsset | null) => void;
  products: ProductAsset[];
  onProducts: (updater: (prev: ProductAsset[]) => ProductAsset[]) => void;
}) {
  const logoInput = useRef<HTMLInputElement>(null);
  const productInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"logo" | "products" | "names" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadLogo = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy("logo");
    setError(null);
    try {
      const [data, dataUri] = await Promise.all([post(brandId, file, "logo"), readDataUri(file)]);
      if (data.logoPath && data.url) onLogo({ path: data.logoPath, url: data.url, dataUri });
      else setError(data.error ?? "Logo upload failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo upload failed");
    }
    setBusy(null);
  };

  const uploadProducts = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("products");
    setError(null);
    const added: ProductAsset[] = [];
    const room = Math.max(0, MAX_PRODUCTS - products.length);
    for (const file of [...files].slice(0, room)) {
      const data = await post(brandId, file, "product").catch(() => ({ error: "Upload failed" }) as { photo?: BrandPhoto; url?: string; error?: string });
      if (data.photo && data.url && !products.some((p) => p.path === data.photo!.path) && !added.some((p) => p.path === data.photo!.path)) {
        added.push({ path: data.photo.path, url: data.url, name: "" });
      } else if (!data.photo) setError(data.error ?? "Upload failed");
    }
    if (added.length) {
      onProducts((prev) => [...prev, ...added]);
      setBusy("names");
      try {
        const res = await fetch(`/api/brands/${brandId}/photos/describe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths: added.map((a) => a.path) }),
        });
        const d = (await res.json().catch(() => ({}))) as { items?: { path: string; productName: string }[] };
        const names = new Map((d.items ?? []).map((i) => [i.path, i.productName]));
        // Only fill names the owner hasn't typed in the meantime.
        onProducts((prev) => prev.map((p) => (!p.name && names.get(p.path) ? { ...p, name: names.get(p.path)! } : p)));
      } catch {
        // Naming is a convenience; the owner can type names.
      }
    }
    setBusy(null);
  };

  const removeProduct = (p: ProductAsset) => {
    onProducts((prev) => prev.filter((x) => x.path !== p.path));
    fetch(`/api/brands/${brandId}/photos?path=${encodeURIComponent(p.path)}`, { method: "DELETE" }).catch(() => undefined);
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-medium">Logo</h2>
        <p className="text-xs text-text-muted mt-0.5">PNG, JPG, WebP or SVG. Its colours become your starting palette.</p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => logoInput.current?.click()}
            disabled={busy === "logo"}
            aria-label={logo ? "Replace logo" : "Upload logo"}
            className="w-24 h-24 rounded-xl border border-dashed border-border bg-card hover:border-text/30 grid place-items-center overflow-hidden text-text-muted"
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo.url} alt="Your logo" className="w-full h-full object-contain p-2" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-xs">
                <Plus size={16} />
                {busy === "logo" ? "Uploading…" : "Add logo"}
              </span>
            )}
          </button>
          {logo && (
            <div className="flex gap-3 text-sm">
              <button onClick={() => logoInput.current?.click()} className="underline-offset-4 hover:underline">
                Replace
              </button>
              <button onClick={() => onLogo(null)} className="text-text-muted hover:text-text underline-offset-4 hover:underline">
                Remove
              </button>
            </div>
          )}
        </div>
        <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { uploadLogo(e.target.files); e.target.value = ""; }} />
      </section>

      <section>
        <h2 className="text-sm font-medium">Products</h2>
        <p className="text-xs text-text-muted mt-0.5">Up to {MAX_PRODUCTS} photos. Carousel posts show each product on its own slide.</p>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {products.map((p) => (
            <div key={p.path} className="space-y-1.5">
              <div className="relative group aspect-square rounded-lg overflow-hidden bg-surface border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.name || "Product"} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeProduct(p)}
                  aria-label={`Remove ${p.name || "product"}`}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  <X size={12} />
                </button>
              </div>
              <input
                value={p.name}
                onChange={(e) => onProducts((prev) => prev.map((x) => (x.path === p.path ? { ...x, name: e.target.value } : x)))}
                placeholder="Product name"
                aria-label="Product name"
                maxLength={60}
                className="w-full h-8 rounded-md border border-border bg-card px-2 text-sm"
              />
            </div>
          ))}
          {products.length < MAX_PRODUCTS && (
            <button
              onClick={() => productInput.current?.click()}
              disabled={busy === "products"}
              className="aspect-square rounded-lg border-2 border-dashed border-border text-text-muted hover:text-text hover:border-text/30 flex flex-col items-center justify-center gap-1 text-xs"
            >
              <Plus size={16} />
              {busy === "products" ? "Uploading…" : "Add products"}
            </button>
          )}
        </div>
        {busy === "names" && <p className="text-xs text-text-muted mt-2">Suggesting names…</p>}
        <input ref={productInput} type="file" accept="image/*" multiple hidden onChange={(e) => { uploadProducts(e.target.files); e.target.value = ""; }} />
      </section>

      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
