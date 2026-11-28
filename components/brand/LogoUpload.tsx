"use client";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { BrandModel } from "@/lib/brand/model";
import { uploadBrandImage } from "@/lib/brand/upload-client";
import { LogoGenerator } from "./LogoGenerator";

/** Shows the brand's logo and lets the owner replace it with their own file. */
export function LogoUpload({ model, onChange }: { model: BrandModel; onChange: (logoPath: string) => void }) {
  const { logoPath, logoUrl } = model.expression;
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!logoPath || signed[logoPath]) return;
    fetch(`/api/brands/${model.id}/photos?path=${encodeURIComponent(logoPath)}`)
      .then((r) => r.json())
      .then((d: { photos?: { path: string; url: string }[] }) => setSigned((s) => ({ ...s, ...Object.fromEntries((d.photos ?? []).map((p) => [p.path, p.url])) })))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoPath, model.id]);

  const upload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const data = await uploadBrandImage(model.id, file, "logo");
    if (data.logoPath) {
      if (data.url) setSigned((s) => ({ ...s, [data.logoPath!]: data.url! }));
      onChange(data.logoPath);
    } else setError(data.error ?? "Logo upload failed");
    setBusy(false);
  };

  const src = (logoPath && signed[logoPath]) || (!logoPath ? logoUrl : undefined);

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-xl border border-border bg-white grid place-items-center overflow-hidden">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="Logo" className="w-full h-full object-contain p-2" />
          ) : (
            <span className="text-xs text-text-muted">No logo</span>
          )}
        </div>
        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
        >
          <Plus size={14} />
          {busy ? "Uploading…" : src ? "Replace logo" : "Upload logo"}
        </button>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      {error && <p className="text-xs text-error mt-2">{error}</p>}
      <p className="text-xs text-text-muted mt-2">PNG, JPG, WebP or SVG, up to 5 MB. Used on every post.</p>
      <LogoGenerator
        model={model}
        hasLogo={!!src}
        onPick={(l) => {
          setSigned((s) => ({ ...s, [l.logoPath]: l.url }));
          onChange(l.logoPath);
        }}
      />
    </div>
  );
}
