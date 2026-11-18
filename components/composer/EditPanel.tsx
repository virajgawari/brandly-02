"use client";
import { useState, type ReactNode } from "react";

/** One collapsible section of the edit panel, with an optional show/hide switch for the element it controls. */
export function EditSection({ title, shown, onToggle, defaultOpen = false, children }: { title: string; shown?: boolean; onToggle?: (v: boolean) => void; defaultOpen?: boolean; children?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl">
      <div className="flex items-center gap-2 px-4 py-3">
        <button aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex-1 text-left text-sm font-medium">
          {title}
        </button>
        {onToggle && (
          <button
            role="switch"
            aria-checked={shown}
            aria-label={`${shown ? "Hide" : "Show"} ${title}`}
            onClick={() => onToggle(!shown)}
            className={`text-xs px-2.5 py-1 rounded-full border ${shown ? "bg-accent/10 border-accent/40 text-accent-light" : "border-border text-text-muted"}`}
          >
            {shown ? "Shown" : "Hidden"}
          </button>
        )}
      </div>
      {open && children && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}
