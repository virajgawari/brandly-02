"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import clsx from "clsx";
import { Button, Card } from "@/components/ui";

interface Insight {
  id: string;
  statement: string;
  confidence: number;
  status: "proposed" | "accepted" | "dismissed";
  stats: { n?: number };
}
interface LastRun {
  created_at: string;
  posts_seen: number;
  findings: number;
}

/** What the agent learned from this brand's posts. Accepted insights shape future posts. */
export default function InsightsCard({ brandId }: { brandId: string }) {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/agent/insights?brandId=${brandId}`);
      if (!r.ok) return;
      const d = await r.json();
      setInsights(d.insights ?? []);
      setLastRun(d.lastRun ?? null);
    } catch {
      /* the card just stays empty */
    }
  }, [brandId]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, status: Insight["status"]) {
    setInsights((list) => list?.map((i) => (i.id === id ? { ...i, status } : i)) ?? null);
    const r = await fetch("/api/agent/insights", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (!r.ok) load();
  }

  async function learn() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/agent/insights", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandId }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not check your posts.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check your posts.");
    } finally {
      setBusy(false);
    }
  }

  if (insights === null) return null;
  const open = insights.filter((i) => i.status === "proposed");
  const accepted = insights.filter((i) => i.status === "accepted");

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-medium">What works for you</h2>
        <Button variant="ghost" size="sm" onClick={learn} disabled={busy}>
          {busy ? "Checking…" : "Check my posts"}
        </Button>
      </div>
      <p className="text-xs text-text-muted mb-4">
        {lastRun ? `Last checked ${new Date(lastRun.created_at).toLocaleDateString()} across ${lastRun.posts_seen} posts.` : "Brandly compares your posts and spots patterns. Accepted ones guide new posts."}
      </p>
      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      {open.length === 0 && accepted.length === 0 ? (
        <p className="text-sm text-text-muted">{lastRun ? "No clear patterns yet. A few more posts will help." : "Nothing yet. Write and schedule a few posts first."}</p>
      ) : (
        <ul className="space-y-2">
          {open.map((i) => (
            <li key={i.id} className="rounded-lg border border-border p-3">
              <p className="text-sm leading-relaxed">{i.statement}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-text-muted">{Math.round(i.confidence * 100)}% sure{i.stats?.n ? ` · ${i.stats.n} posts` : ""}</span>
                <span className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => decide(i.id, "dismissed")}>
                    <X size={14} /> Dismiss
                  </Button>
                  <Button size="sm" onClick={() => decide(i.id, "accepted")}>
                    <Check size={14} /> Use this
                  </Button>
                </span>
              </div>
            </li>
          ))}
          {accepted.map((i) => (
            <li key={i.id} className={clsx("rounded-lg bg-text/5 p-3 flex items-start gap-3")}>
              <Check size={14} className="mt-1 shrink-0" />
              <p className="text-sm leading-relaxed flex-1">{i.statement}</p>
              <button className="text-xs text-text-muted hover:text-text shrink-0" onClick={() => decide(i.id, "dismissed")}>
                Stop using
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
