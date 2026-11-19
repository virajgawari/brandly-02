"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { useStore } from "@/lib/store";
import { uploadBrandImage } from "@/lib/brand/upload-client";
import type { Product } from "@/lib/catalog/product";
import { photosFromProducts, removeProductPaths, unlistedProductPhotos } from "@/lib/catalog/sync";

type Draft = { id?: string; name: string; description: string; price: string; url: string; imagePaths: string[]; source: Product["source"] };
const EMPTY: Draft = { name: "", description: "", price: "", url: "", imagePaths: [], source: "manual" };

export default function CatalogPage() {
  const brand = useStore((s) => s.getActiveBrand());
  const saveBrandModel = useStore((s) => s.saveBrandModel);
  const backfilled = useRef<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const deviceRef = useRef<HTMLInputElement>(null);

  const fetchProducts = useCallback(async (brandId: string) => {
    const res = await fetch(`/api/products?brandId=${brandId}`).catch(() => null);
    return res?.ok ? ((await res.json()) as { products: Product[]; urls: Record<string, string> }) : null;
  }, []);

  const load = useCallback(async (): Promise<Product[]> => {
    if (!brand) return [];
    setLoading(true);
    let data = await fetchProducts(brand.id);
    // Product photos added in Assets or onboarding become products here, once per visit.
    if (data && backfilled.current !== brand.id) {
      backfilled.current = brand.id;
      const missing = unlistedProductPhotos(brand.model?.expression.photos ?? [], data.products);
      if (missing.length) {
        await Promise.all(
          missing.map((m) =>
            fetch("/api/products", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ brandId: brand.id, name: m.name, imagePaths: m.imagePaths, source: "brand" }),
            }).catch(() => null)
          )
        );
        data = (await fetchProducts(brand.id)) ?? data;
      }
    }
    if (data) {
      setProducts(data.products);
      setUrls((u) => ({ ...u, ...data.urls }));
    } else setError("Couldn't load your products.");
    setLoading(false);
    return data?.products ?? [];
  }, [brand, fetchProducts]);

  // Puts the Catalogue's product photos on the brand's photo list, which is what posts read.
  const pushToModel = (list: Product[], removedPaths: string[] = []) => {
    const b = useStore.getState().getActiveBrand();
    if (!b?.model) return;
    const photos = photosFromProducts(list, removeProductPaths(b.model.expression.photos ?? [], removedPaths));
    saveBrandModel({ ...b.model, expression: { ...b.model.expression, photos } }, b.sources);
  };

  useEffect(() => {
    load();
  }, [load]);

  const importFromUrl = async () => {
    if (!brand || !importUrl.trim()) return;
    setImporting(true);
    setError(null);
    const res = await fetch("/api/products/import-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: brand.id, url: importUrl.trim() }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setImporting(false);
    if (!res?.ok) return setError(data?.error ?? "Couldn't import that link.");
    setImportUrl("");
    pushToModel(await load());
  };

  // Uploads photos from the device. With no dialog open, starts a new product from them (name from the file name).
  const upload = async (files: File[]) => {
    if (!brand || !files.length) return;
    setError(null);
    setUploading(true);
    const paths: string[] = [];
    for (const file of files.slice(0, 6)) {
      const r = await uploadBrandImage(brand.id, file, "product");
      if (r.error || !r.photo) {
        setError(r.error ?? "Upload failed.");
        continue;
      }
      setUrls((u) => ({ ...u, [r.photo!.path]: r.url ?? "" }));
      paths.push(r.photo.path);
    }
    setUploading(false);
    if (!paths.length) return;
    setDraft((d) =>
      d
        ? { ...d, imagePaths: [...d.imagePaths, ...paths].slice(0, 6) }
        : { ...EMPTY, name: files[0].name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim(), imagePaths: paths }
    );
  };

  const save = async () => {
    if (!brand || !draft?.name.trim()) return setError("Give the product a name.");
    setSaving(true);
    setError(null);
    const body = { name: draft.name, description: draft.description, price: draft.price, url: draft.url, imagePaths: draft.imagePaths, source: draft.source };
    const res = await fetch(draft.id ? `/api/products/${draft.id}` : "/api/products", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft.id ? body : { ...body, brandId: brand.id }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setSaving(false);
    if (!res?.ok) return setError(data?.error ?? "Couldn't save the product.");
    const before = products.find((p) => p.id === draft.id)?.imagePaths ?? [];
    const dropped = before.filter((x) => !draft.imagePaths.includes(x));
    setDraft(null);
    pushToModel(await load(), dropped);
  };

  const archive = async (id: string) => {
    const gone = products.find((p) => p.id === id)?.imagePaths ?? [];
    await fetch(`/api/products/${id}`, { method: "DELETE" }).catch(() => null);
    setDraft(null);
    pushToModel(await load(), gone);
  };

  const edit = (p: Product) =>
    setDraft({ id: p.id, name: p.name, description: p.description, price: p.price ?? "", url: p.url ?? "", imagePaths: p.imagePaths, source: p.source });

  if (!brand) {
    return (
      <AppShell>
        <PageHeader title="Catalogue" />
        <EmptyState title="Set up a brand first" description="Products belong to a brand." action={<Link href="/onboarding"><Button>Set up your brand</Button></Link>} />
      </AppShell>
    );
  }

  const field = "w-full h-10 px-3 rounded-lg border border-border bg-bg text-sm placeholder:text-text-muted focus:outline-none focus:border-text/40";

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
        <PageHeader
          title="Catalogue"
          subtitle="The products you sell. Pick one to make a post around it."
          action={<Button onClick={() => setDraft({ ...EMPTY })}>Add product</Button>}
        />

        <div className="grid gap-4 md:grid-cols-2 mb-8">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              upload([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
            }}
            className={`rounded-2xl border border-dashed p-5 flex flex-col justify-between gap-4 transition-colors ${dragging ? "border-text bg-text/5" : "border-border bg-card"}`}
          >
            <div>
              <p className="text-sm font-medium">Upload from your device</p>
              <p className="text-sm text-text-muted mt-1">Choose or drop up to 6 photos of a product.</p>
            </div>
            <div>
              <Button variant="secondary" loading={uploading} onClick={() => deviceRef.current?.click()}>Choose photos</Button>
            </div>
            <input ref={deviceRef} type="file" accept="image/*" multiple hidden onChange={(e) => { upload([...(e.target.files ?? [])]); e.target.value = ""; }} />
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 flex flex-col justify-between gap-4">
            <div>
              <label htmlFor="import-url" className="text-sm font-medium">Add from a product link</label>
              <p className="text-sm text-text-muted mt-1">We read the name, photo and price from the page.</p>
            </div>
            <div className="flex gap-2">
              <input
                id="import-url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && importFromUrl()}
                placeholder="https://yourshop.com/products/cold-brew"
                className={`${field} flex-1 min-w-0`}
              />
              <Button onClick={importFromUrl} loading={importing} variant="secondary">Import</Button>
            </div>
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-error mb-4">{error}</p>}

        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card py-14 text-center">
            <p className="font-medium">No products yet</p>
            <p className="text-sm text-text-muted mt-1">Upload photos, paste a product link, or add one by hand.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-text-muted mb-3 tabular-nums">{products.length} {products.length === 1 ? "product" : "products"}</p>
            <ul className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {products.map((p) => (
                <li key={p.id}>
                  <div className="rounded-2xl border border-border bg-card overflow-hidden h-full flex flex-col hover:border-text/30 transition-colors">
                    <button onClick={() => edit(p)} className="text-left flex-1" aria-label={`Edit ${p.name}`}>
                      <div className="aspect-square bg-text/5 overflow-hidden">
                        {p.imagePaths[0] && urls[p.imagePaths[0]] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={urls[p.imagePaths[0]]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-xs text-text-muted">No photo</div>
                        )}
                      </div>
                      <div className="px-3.5 pt-3">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-text-muted mt-0.5 h-4 truncate">{p.price ?? ""}</p>
                      </div>
                    </button>
                    <div className="px-3.5 py-3">
                      <Link href={`/composer?product=${p.id}`} className="inline-flex items-center h-8 px-3 rounded-lg border border-border text-xs font-medium hover:border-text/30">
                        Create post
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {draft && (
        <div role="dialog" aria-modal="true" aria-label="Product details" className="fixed inset-0 z-40 bg-black/40 grid place-items-center p-4" onClick={() => setDraft(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">{draft.id ? "Edit product" : "Add product"}</h2>
            <div>
              <label className="text-xs text-text-muted" htmlFor="p-name">Name</label>
              <input id="p-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${field} mt-1`} />
            </div>
            <div>
              <label className="text-xs text-text-muted" htmlFor="p-desc">Description</label>
              <textarea id="p-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What is it, who is it for?" rows={4} className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-bg text-sm placeholder:text-text-muted focus:outline-none focus:border-text/40" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted" htmlFor="p-price">Price</label>
                <input id="p-price" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="Optional" className={`${field} mt-1`} />
              </div>
              <div>
                <label className="text-xs text-text-muted" htmlFor="p-link">Product link</label>
                <input id="p-link" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="Optional" className={`${field} mt-1`} />
              </div>
            </div>
            <div>
              <p className="text-xs text-text-muted">Photos</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-1">
                {draft.imagePaths.map((path) => (
                  <div key={path} className="relative aspect-square rounded-lg overflow-hidden bg-text/5">
                    {urls[path] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urls[path]} alt="" className="w-full h-full object-cover" />
                    )}
                    <button aria-label="Remove photo" onClick={() => setDraft({ ...draft, imagePaths: draft.imagePaths.filter((x) => x !== path) })} className="absolute top-1 right-1 bg-black/60 text-white text-xs w-5 h-5 rounded-full">×</button>
                  </div>
                ))}
                {draft.imagePaths.length < 6 && (
                  <button onClick={() => fileRef.current?.click()} className="aspect-square rounded-lg border border-dashed border-border text-xs text-text-muted hover:border-text/40 hover:text-text">+ Add</button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { upload([...(e.target.files ?? [])]); e.target.value = ""; }} />
            </div>
            <div className="flex justify-between items-center pt-2">
              {draft.id ? <Button variant="danger" onClick={() => archive(draft.id!)}>Archive</Button> : <span />}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                <Button onClick={save} loading={saving}>Save</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
