import { FIT_PASS, MAX_GAP, MIN_FACETS, NOTABLE_GAP } from "@/lib/judge/config";
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
      <details className="pt-1">
        <summary className="cursor-pointer text-xs font-medium text-text-muted">Scoring details</summary>
        <div className="mt-2 space-y-3 text-xs">
          <div>
            <p className="font-semibold mb-1">Rules</p>
            <p className="text-text-muted">{rules.passed ? "All rule checks passed (banned words, platform length, hashtags, emoji first)." : rules.failures.join("; ")}</p>
          </div>
          <div>
            <p className="font-semibold mb-1">Brand fit</p>
            <p className="text-text-muted mb-2">
              Fit = 100 minus the average gap between the post and the brand profile. Passes at {FIT_PASS}+ with no single gap over {MAX_GAP}. At least {MIN_FACETS} facets must be scored, otherwise the result is unclear and the post passes.
            </p>
            {fit.facets.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-text-muted">
                    <tr>
                      <th className="pr-3 py-1 font-medium">Facet</th>
                      <th className="pr-3 py-1 font-medium">Brand</th>
                      <th className="pr-3 py-1 font-medium">Post</th>
                      <th className="pr-3 py-1 font-medium">Gap</th>
                      <th className="py-1 font-medium">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...fit.facets]
                      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
                      .map((f) => (
                        <tr key={f.facet} className="border-t border-border align-top">
                          <td className="pr-3 py-1">{LABEL[f.facet] ?? f.facet}</td>
                          <td className="pr-3 py-1">{f.target}</td>
                          <td className="pr-3 py-1">{f.score}</td>
                          <td className="pr-3 py-1">{f.gap > 0 ? `+${f.gap}` : f.gap}</td>
                          <td className="py-1 italic text-text-muted">{f.quote ? `“${f.quote}”` : ""}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-text-muted">No facets were scored.</p>
            )}
          </div>
          <p className="text-text-muted">Judge version {check.version}. Raw prompts and replies are in the llm_calls table (feature: judge).</p>
        </div>
      </details>
    </div>
  );
}
