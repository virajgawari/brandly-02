"use client";
import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";
import clsx from "clsx";
import AppShell from "@/components/layout/AppShell";
import { Button, Card } from "@/components/ui";
import { useStore } from "@/lib/store";

interface Config {
  enabled: boolean;
  window_days: number;
  min_sample: number;
  min_lift: number;
  engagement_weight: number;
  auto_apply: boolean;
  use_llm: boolean;
}
interface Insight {
  id: string;
  brand_id: string;
  statement: string;
  confidence: number;
  status: "proposed" | "accepted" | "dismissed";
  metric: string;
  stats: { n?: number; lift?: number };
  evidence_post_ids: string[];
  brands: { name: string } | null;
}
interface Run {
  id: string;
  trigger: string;
  posts_seen: number;
  with_metrics: number;
  findings: number;
  error: string | null;
  created_at: string;
  brands: { name: string } | null;
  llm_calls: { cost_usd: number | null; model: string | null } | null;
}
interface AuditRow {
  id: string;
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}
interface Data {
  config: Config;
  insights: Insight[];
  runs: Run[];
  audit: AuditRow[];
  cost30d: { calls: number; usd: number; tokens: number };
}

const post = (body: unknown) => fetch("/api/admin/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const when = (iso: string) => format(parseISO(iso), "d MMM, HH:mm");

export default function AdminAgentPage() {
  const brands = useStore((s) => s.brands);
  const activeBrandId = useStore((s) => s.activeBrandId);
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Config | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/agent");
    const d = await r.json();
    if (r.status === 403 || r.status === 401) return setDenied(d.error ?? "Admins only.");
    if (!r.ok) return setError(d.error ?? "Could not load.");
    setData(d);
    setDraft(d.config);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function act(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await post(body);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "That didn't work.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (denied)
    return (
      <AppShell>
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <h1 className="text-xl font-semibold">Admins only</h1>
          <p className="text-sm text-text-muted mt-2">{denied}</p>
        </div>
      </AppShell>
    );

  const changed = data && draft && JSON.stringify(data.config) !== JSON.stringify(draft);
  const num = (k: keyof Config, step = 1) => (
    <input
      type="number"
      step={step}
      value={draft ? Number(draft[k]) : 0}
      onChange={(e) => draft && setDraft({ ...draft, [k]: Number(e.target.value) })}
      className="w-24 h-9 rounded-lg border border-border bg-card px-2 text-sm tabular-nums"
    />
  );
  const toggle = (k: "enabled" | "auto_apply" | "use_llm", label: string, hint: string) => (
    <label className="flex items-start gap-3 py-2 cursor-pointer">
      <input type="checkbox" checked={!!draft?.[k]} onChange={(e) => draft && setDraft({ ...draft, [k]: e.target.checked })} className="mt-1" />
      <span>
        <span className="text-sm font-medium block">{label}</span>
        <span className="text-xs text-text-muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Learning agent</h1>
          <p className="text-sm text-text-muted mt-1">Tune what the agent looks for, review what it found, and see what it costs.</p>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {!data && !error && <p className="text-sm text-text-muted">Loading…</p>}

        {data && draft && (
          <>
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <Card className="p-5">
                <h2 className="font-medium mb-3">Settings</h2>
                {toggle("enabled", "Learning on", "When off, no new insights are produced. Accepted ones keep applying.")}
                {toggle("auto_apply", "Apply new insights automatically", "Skips the Accept step for new findings. Off by default so people stay in control.")}
                {toggle("use_llm", "Reword insights with a model", "One small model call per run. Off keeps the plain generated sentences.")}
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mt-3 text-sm">
                  <label className="flex items-center justify-between gap-3">Look back (days) {num("window_days")}</label>
                  <label className="flex items-center justify-between gap-3">Posts needed per group {num("min_sample")}</label>
                  <label className="flex items-center justify-between gap-3">Smallest difference (0.3 = 30%) {num("min_lift", 0.05)}</label>
                  <label className="flex items-center justify-between gap-3">Engagement vs. picks (0 to 1) {num("engagement_weight", 0.1)}</label>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    disabled={!changed || busy}
                    onClick={() => {
                      const { enabled, window_days, min_sample, min_lift, engagement_weight, auto_apply, use_llm } = draft;
                      act({ action: "config", patch: { enabled, window_days, min_sample, min_lift, engagement_weight, auto_apply, use_llm } });
                    }}
                  >
                    Save settings
                  </Button>
                  {changed && (
                    <Button variant="ghost" onClick={() => setDraft(data.config)}>
                      Undo
                    </Button>
                  )}
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="font-medium">Last 30 days</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-text-muted">Model calls</dt><dd className="tabular-nums">{data.cost30d.calls}</dd></div>
                  <div className="flex justify-between"><dt className="text-text-muted">Tokens</dt><dd className="tabular-nums">{data.cost30d.tokens.toLocaleString()}</dd></div>
                  <div className="flex justify-between"><dt className="text-text-muted">Cost</dt><dd className="tabular-nums">${data.cost30d.usd.toFixed(4)}</dd></div>
                </dl>
                <h3 className="text-sm font-medium mt-5 mb-2">Run now</h3>
                <ul className="space-y-1">
                  {brands.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2">
                      <span className={clsx("text-sm truncate", b.id === activeBrandId && "font-medium")}>{b.name}</span>
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => act({ action: "relearn", brandId: b.id })}>
                        Relearn
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            <Card className="p-5">
              <h2 className="font-medium mb-3">Insights ({data.insights.length})</h2>
              {data.insights.length === 0 ? (
                <p className="text-sm text-text-muted">None yet. Run the learner once there are a few posts.</p>
              ) : (
                <ul className="divide-y divide-border -mx-5">
                  {data.insights.map((i) => (
                    <li key={i.id} className="px-5 py-3 flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{i.statement}</p>
                        <p className="text-xs text-text-muted mt-1">
                          {i.brands?.name} · {i.metric} · {Math.round(i.confidence * 100)}% sure · {i.stats?.n ?? "?"} posts · {i.evidence_post_ids.length} cited
                        </p>
                      </div>
                      <select
                        value={i.status}
                        disabled={busy}
                        onChange={(e) => act({ action: "insight", id: i.id, status: e.target.value })}
                        className="h-8 rounded-lg border border-border bg-card px-2 text-xs"
                        aria-label="Status"
                      >
                        <option value="proposed">Proposed</option>
                        <option value="accepted">Accepted</option>
                        <option value="dismissed">Dismissed</option>
                      </select>
                      <button aria-label="Delete insight" className="text-text-muted hover:text-danger p-1" disabled={busy} onClick={() => act({ action: "delete-insight", id: i.id })}>
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="font-medium mb-3">Runs</h2>
                {data.runs.length === 0 ? (
                  <p className="text-sm text-text-muted">No runs yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {data.runs.map((r) => (
                      <li key={r.id} className="flex justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate">{r.brands?.name} · {r.findings} findings from {r.posts_seen} posts</span>
                          {r.error && <span className="block text-xs text-danger truncate">{r.error}</span>}
                        </span>
                        <span className="text-xs text-text-muted shrink-0 text-right">
                          {when(r.created_at)}
                          <br />
                          {r.llm_calls ? `$${Number(r.llm_calls.cost_usd ?? 0).toFixed(4)}` : "no model call"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card className="p-5">
                <h2 className="font-medium mb-3">Changes</h2>
                {data.audit.length === 0 ? (
                  <p className="text-sm text-text-muted">Nothing changed yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {data.audit.map((a) => (
                      <li key={a.id} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">
                          {a.action}
                          {Object.keys(a.detail).length > 0 && <span className="text-xs text-text-muted"> {JSON.stringify(a.detail)}</span>}
                        </span>
                        <span className="text-xs text-text-muted shrink-0">{when(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
