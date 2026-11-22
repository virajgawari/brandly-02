"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { SCOREBOARD_MIN } from "@/lib/agent/stats";

interface Board {
  scored: number;
  awaitingMetrics: number;
  highFit?: number;
  lowFit?: number;
  verdict: "not-enough" | "up" | "flat" | "down";
}

const pct = (n?: number) => (n === undefined ? "–" : `${(n * 100).toFixed(1)}%`);

const VERDICT: Record<Board["verdict"], string> = {
  "not-enough": "",
  up: "Posts Brandly rated as a closer match to your brand are getting more engagement. The check is working for you.",
  flat: "Brand-fit score and engagement aren't clearly linked yet. More posts with numbers will tell.",
  down: "Higher-scored posts aren't doing better for you. Treat the score as a guide only for now.",
};

/** Does Brandly's brand-fit score line up with what your audience actually did? */
export default function ScoreboardCard({ brandId }: { brandId: string }) {
  const [b, setB] = useState<Board | null>(null);

  useEffect(() => {
    fetch(`/api/agent/scoreboard?brandId=${brandId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setB(d))
      .catch(() => setB(null));
  }, [brandId]);

  if (!b) return null;
  const ready = b.verdict !== "not-enough";

  return (
    <Card className="p-5">
      <h2 className="font-medium mb-1">Is the brand check right?</h2>
      <p className="text-xs text-text-muted mb-4">Brandly&apos;s fit score for each post against what your audience did with it.</p>
      {ready ? (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-text-muted">Higher-scored posts</p>
              <p className="text-lg font-medium">{pct(b.highFit)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-text-muted">Lower-scored posts</p>
              <p className="text-lg font-medium">{pct(b.lowFit)}</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed">{VERDICT[b.verdict]}</p>
        </>
      ) : (
        <p className="text-sm text-text-muted">
          This check needs {SCOREBOARD_MIN} posts with both a score and numbers; you have {b.scored}. Add likes, comments and reach to your published posts to see how the check holds up.
          {b.awaitingMetrics > 0 ? ` ${b.awaitingMetrics} are waiting on numbers.` : ""}
        </p>
      )}
    </Card>
  );
}
