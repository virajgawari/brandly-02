import { NOTABLE_GAP } from "@/lib/judge/fit";
import type { PostCheck } from "@/lib/types";

const LABEL: Record<string, string> = {
  sincerity: "Sincere",
  excitement: "Exciting",
  competence: "Competent",
  sophistication: "Sophisticated",
  ruggedness: "Rugged",
  funny_serious: "Serious",
  formal_casual: "Casual",
  respectful_irreverent: "Irreverent",
  enthusiastic_matter: "Matter-of-fact",
};

/** Plain summary of the checks run after generation: brand fit, rule failures, facets that are off. */
export function Scorecard({ check, text }: { check: PostCheck; text?: string }) {
  const stale = !!check.text && text !== undefined && text !== check.text;
  const { rules, fit, revised } = check;
  const off = fit.facets.filter((f) => Math.abs(f.gap) > NOTABLE_GAP);
  return (
    <div className="rounded-xl bg-surface p-4 text-sm space-y-2">
      <p className="font-semibold">
        {fit.status === "ok" ? `Brand fit ${fit.fit}` : fit.status === "unsure" ? "Brand fit unclear for this post" : "Brand check unavailable right now."}
        {stale && <span className="ml-2 text-xs font-normal text-text-muted">Edited after check</span>}
        {revised && <span className="ml-2 text-xs font-normal text-text-muted">Revised once</span>}
      </p>
      {!rules.passed && <p className="text-text-muted">Rules: {rules.failures.join("; ")}</p>}
      {off.map((f) => (
        <p key={f.facet} className="text-text-muted">
          {LABEL[f.facet] ?? f.facet}: post {f.score}, brand {f.target}
          {f.quote && <span className="italic"> “{f.quote}”</span>}
        </p>
      ))}
    </div>
  );
}
