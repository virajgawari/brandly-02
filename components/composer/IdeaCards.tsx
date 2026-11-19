"use client";
import { TemplateIcon } from "@/components/ui/icons";
import { CONTENT_TEMPLATES } from "@/lib/templates";
import type { PostIdea } from "@/lib/content/ideas";
import type { TemplateCategory } from "@/lib/types";

/** Four post ideas from the brand profile. Clicking one writes that post. */
export default function IdeaCards({ ideas, loading, disabled, onPick }: { ideas: PostIdea[]; loading: boolean; disabled?: boolean; onPick: (i: PostIdea) => void }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-hidden>
        {[0, 1, 2, 3].map((n) => <div key={n} className="h-36 rounded-xl bg-text/5 animate-pulse" />)}
      </div>
    );
  }
  if (!ideas.length) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {ideas.map((i) => (
        <button
          key={i.title}
          disabled={disabled}
          onClick={() => onPick(i)}
          className="p-4 rounded-xl border border-border text-left hover:border-accent/40 transition-all disabled:opacity-50 flex flex-col gap-2"
        >
          <span className="text-[11px] text-text-muted flex items-center gap-1.5">
            <TemplateIcon id={i.template as TemplateCategory} />
            {CONTENT_TEMPLATES.find((t) => t.id === i.template)?.label}
          </span>
          <span className="text-sm font-medium text-text">{i.title}</span>
          <span className="text-xs text-text-muted leading-relaxed">{i.pitch}</span>
        </button>
      ))}
    </div>
  );
}
