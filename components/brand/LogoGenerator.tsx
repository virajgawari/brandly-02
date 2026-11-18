"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { BrandModel } from "@/lib/brand/model";
import { uploadBrandImage } from "@/lib/brand/upload-client";

export interface PickedLogo {
  logoPath: string;
  url: string;
  dataUri: string;
}

const toFile = async (dataUri: string) => {
  const blob = await (await fetch(dataUri)).blob();
  return new File([blob], "logo.png", { type: "image/png" });
};

/** Makes 3 logo options from the brand profile; the one the owner picks is saved like an uploaded logo. */
export function LogoGenerator({ model, onPick, hasLogo }: { model: BrandModel; onPick: (logo: PickedLogo) => void; hasLogo?: boolean }) {
  const [options, setOptions] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<"making" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const make = async () => {
    setBusy("making");
    setError(null);
    try {
      const res = await fetch(`/api/brands/${model.id}/logo/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const data = (await res.json().catch(() => null)) as { logos?: string[]; error?: string } | null;
      if (data?.logos?.length) setOptions(data.logos);
      else setError(data?.error ?? "Couldn't make a logo just now. Try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setBusy(null);
  };

  const pick = async (dataUri: string) => {
    setBusy("saving");
    setError(null);
    const saved = await uploadBrandImage(model.id, await toFile(dataUri), "logo");
    if (saved.logoPath && saved.url) {
      onPick({ logoPath: saved.logoPath, url: saved.url, dataUri });
      setOptions(null);
    } else setError(saved.error ?? "Couldn't save that logo. Try again.");
    setBusy(null);
  };

  return (
    <div className="mt-3">
      <button onClick={make} disabled={busy !== null} className="inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline disabled:opacity-60">
        <Plus size={14} />
        {busy === "making" ? "Designing 3 options… about 20 seconds" : options ? "Try again" : hasLogo ? "Design a new logo for me" : "Design a logo for me"}
      </button>
      {options && (
        <div className="mt-3 grid grid-cols-3 gap-3 max-w-md">
          {options.map((src, i) => (
            <button
              key={i}
              onClick={() => pick(src)}
              disabled={busy !== null}
              aria-label={`Use logo option ${i + 1}`}
              className="aspect-square rounded-xl border border-border bg-white hover:border-text/40 overflow-hidden p-2 disabled:opacity-60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Logo option ${i + 1}`} className="w-full h-full object-contain" />
            </button>
          ))}
        </div>
      )}
      {options && <p className="text-xs text-text-muted mt-2">{busy === "saving" ? "Saving…" : "Tap one to use it."}</p>}
      {error && <p className="text-xs text-error mt-2">{error}</p>}
      {!options && !error && <p className="text-xs text-text-muted mt-1">Made from your brand profile. Simple mark, no text.</p>}
    </div>
  );
}
