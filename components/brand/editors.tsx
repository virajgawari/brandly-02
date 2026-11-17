"use client";
import { useState } from "react";
import clsx from "clsx";
import { Plus, X } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { LockButton, SourceTag } from "@/components/onboarding/kit";
import { sectionConfidence } from "@/lib/brand/merge";
import type { BrandModel } from "@/lib/brand/model";

export const NEEDS_CHECK = 0.6;

/** Card with a title, a source tag and a lock for one model path. */
export function Section({
  id,
  title,
  description,
  model,
  onLock,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  model: BrandModel;
  onLock: (path: string, locked: boolean) => void;
  children: React.ReactNode;
}) {
  const c = sectionConfidence(model, id);
  const needsCheck = c.source !== "user" && !c.locked && c.confidence > 0 && c.confidence < NEEDS_CHECK;
  const empty = c.confidence === 0;
  const locked = !!model.meta[id]?.locked;
  return (
    <Card className={clsx("p-5", needsCheck && "border-warn/40")}>
      <div id={`section-${id}`} className="flex items-start justify-between gap-3 mb-4 scroll-mt-6">
        <div>
          <h2 className="font-medium">{title}</h2>
          {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SourceTag source={empty ? undefined : c.source} needsCheck={needsCheck || (empty && id === "strategy.audience")} />
          <LockButton locked={locked} onToggle={() => onLock(id, !locked)} />
        </div>
      </div>
      {children}
    </Card>
  );
}

/** A 0–100 slider between two words. */
export function ScaleSlider({ left, right, value, onChange }: { left: string; right: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-text-muted mb-2">
        <span className={clsx(value < 40 && "text-text font-medium")}>{left}</span>
        <span className={clsx(value > 60 && "text-text font-medium")}>{right}</span>
      </span>
      <input
        type="range"
        className="tone"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${left} to ${right}`}
      />
    </label>
  );
}

/** Editable chip list (pillars, hashtags, rules, words). */
export function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    onChange([...items, draft.trim()]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {items.map((it, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 min-h-8 py-1 pl-3 pr-1.5 rounded-2xl border border-border bg-bg text-sm leading-snug max-w-full">
            {it}
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${it}`} className="w-5 h-5 grid place-items-center rounded-full text-text-muted hover:text-text hover:bg-text/5">
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={placeholder} className="h-9" />
        <Button variant="secondary" size="sm" className="h-9" onClick={add} aria-label="Add">
          <Plus size={14} />
        </Button>
      </div>
    </div>
  );
}
