"use client";
import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import clsx from "clsx";
import AppShell from "@/components/layout/AppShell";
import { Card, Chip, EmptyState, PageHeader, Spinner } from "@/components/ui";

interface Call {
  id: string;
  feature: string;
  task: string | null;
  provider: string | null;
  model: string | null;
  input: unknown;
  output: string | null;
  parsed_ok: boolean | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  attempts: number;
  fallback_from: string | null;
  error: string | null;
  created_at: string;
  brand_id: string | null;
  brands: { name: string } | null;
}
interface Scrape {
  id: string;
  status: string;
  payload: { handle?: string; runId?: string };
  result: { fetched?: number; posts?: number; top?: number; limit?: number; durationMs?: number; types?: Record<string, number>; followers?: number } | null;
  error: string | null;
  attempts: number;
  created_at: string;
  brand_id: string | null;
  brands: { name: string } | null;
}
interface BrandRow {
  id: string;
  name: string;
  sources: Record<string, unknown>;
  socialPosts: { total: number; top: number };
  brand_versions: { version: number; model: Record<string, unknown>; source: string; created_at: string } | null;
}
interface Data {
  scrapes: Scrape[];
  calls: Call[];
  brands: BrandRow[];
  totals: { calls: number; images: number; usd: number; errors: number };
}

const TABS = [
  { id: "scrapes", label: "Instagram scrapes" },
  { id: "text", label: "Text generation" },
  { id: "image", label: "Image generation" },
  { id: "brands", label: "Brand data" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const when = (iso: string) => format(parseISO(iso), "d MMM, HH:mm:ss");
const usd = (n: number | null | undefined) => (n ? `$${Number(n).toFixed(4)}` : "—");
const statusVariant = (s: string) => (s === "done" ? "success" : s === "error" || s === "dead" ? "error" : "warn") as "success" | "error" | "warn";

function Json({ value }: { value: unknown }) {
  return (
    <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-border bg-surface p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Row({ title, meta, chips, children }: { title: React.ReactNode; meta: React.ReactNode; chips?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-text/[0.03] transition-colors">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{title}</p>
          <p className="text-xs text-text-muted mt-0.5">{meta}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">{chips}</div>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-xl font-semibold tabular-nums mt-1">{value}</p>
    </Card>
  );
}

function CallRow({ c }: { c: Call }) {
  const inp = (c.input ?? {}) as Record<string, unknown>;
  const isImage = c.task === "image";
  const facts: [string, string | number | null][] = [
    ["Provider", c.provider],
    ["Task", c.task],
    ["Attempts", c.attempts],
    ["Fallback from", c.fallback_from],
    ["Parsed OK", c.parsed_ok == null ? null : String(c.parsed_ok)],
    ["Input tokens", c.input_tokens],
    ["Output tokens", c.output_tokens],
  ];
  return (
    <Row
      title={isImage ? String(inp.prompt ?? c.feature).slice(0, 120) : c.feature}
      meta={`${when(c.created_at)} · ${c.brands?.name ?? (c.brand_id ? "Deleted brand" : "Workspace-level")} · ${c.model ?? "?"}${c.latency_ms ? ` · ${(c.latency_ms / 1000).toFixed(1)}s` : ""}`}
      chips={
        <>
          {c.input_tokens != null && <span className="text-xs text-text-muted tabular-nums">{(c.input_tokens ?? 0) + (c.output_tokens ?? 0)} tok</span>}
          <span className="text-xs text-text-muted tabular-nums">{usd(c.cost_usd)}</span>
          <Chip variant={c.error ? "error" : "success"}>{c.error ? "failed" : "ok"}</Chip>
        </>
      }
    >
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-text-muted">{k}</dt>
            <dd className="font-medium">{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {c.error && <p className="mt-3 text-xs text-error">{c.error}</p>}
      <p className="mt-3 text-xs text-text-muted">{isImage ? "Request" : "Prompt"}</p>
      <Json value={c.input} />
      {!isImage && c.output && (
        <>
          <p className="mt-3 text-xs text-text-muted">Response</p>
          <Json value={c.output} />
        </>
      )}
    </Row>
  );
}

export default function AdminActivityPage() {
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("scrapes");
  const [brand, setBrand] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/activity${brand ? `?brand=${brand}` : ""}`);
    if (res.status === 403 || res.status === 401) setDenied((await res.json()).error ?? "Not allowed.");
    else if (res.ok) setData(await res.json());
    setLoading(false);
  }, [brand]);
  useEffect(() => void load(), [load]);

  if (denied)
    return (
      <AppShell>
        <div className="max-w-md mx-auto py-24 text-center">
          <h1 className="text-xl font-semibold">Admins only</h1>
          <p className="text-sm text-text-muted mt-2">{denied}</p>
        </div>
      </AppShell>
    );

  const text = data?.calls.filter((c) => c.task !== "image") ?? [];
  const images = data?.calls.filter((c) => c.task === "image") ?? [];

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">
        <PageHeader
          title="Activity"
          subtitle="Everything that ran behind the scenes: Instagram scrapes, text and image generation, and the data stored for each brand."
          action={
            <>
              <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Filter by brand" className="h-9 rounded-lg border border-border bg-card px-2 text-sm">
                <option value="">All brands</option>
                {data?.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button onClick={load} className="h-9 px-3 rounded-lg border border-border bg-card text-sm hover:bg-text/5">
                Refresh
              </button>
            </>
          }
        />

        {!data ? (
          <div className="py-24 flex justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <Stat label="Scrapes" value={data.scrapes.length} />
              <Stat label="AI calls (recent)" value={data.totals.calls} />
              <Stat label="Images" value={data.totals.images} />
              <Stat label="Cost (recent)" value={`$${data.totals.usd.toFixed(3)}`} />
            </div>

            <div className="flex gap-1 mb-4 border-b border-border" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={clsx("px-3 h-9 text-sm -mb-px border-b-2 transition-colors", tab === t.id ? "border-text font-medium" : "border-transparent text-text-muted hover:text-text")}
                >
                  {t.label}
                </button>
              ))}
              {loading && <span className="ml-auto self-center text-xs text-text-muted">Updating…</span>}
            </div>

            <Card className="overflow-hidden">
              {tab === "scrapes" &&
                (data.scrapes.length === 0 ? (
                  <EmptyState title="No scrapes yet" description="Add an Instagram handle on a brand's Voice tab." />
                ) : (
                  data.scrapes.map((j) => (
                    <Row
                      key={j.id}
                      title={`@${j.payload.handle ?? "?"}`}
                      meta={`${when(j.created_at)} · ${j.brands?.name ?? (j.brand_id ? "Deleted brand" : "Workspace-level")}`}
                      chips={
                        <>
                          {j.result && (
                            <span className="text-xs text-text-muted tabular-nums">
                              {j.result.posts ?? 0} posts · {j.result.top ?? 0} top
                            </span>
                          )}
                          <Chip variant={statusVariant(j.status)}>{j.status}</Chip>
                        </>
                      }
                    >
                      {j.error && <p className="text-xs text-error mb-2">{j.error}</p>}
                      <Json value={{ apifyRunId: j.payload.runId, attempts: j.attempts, ...j.result }} />
                    </Row>
                  ))
                ))}
              {tab === "text" && (text.length === 0 ? <EmptyState title="No text generation yet" description="Calls appear here as soon as the AI writes something." /> : text.map((c) => <CallRow key={c.id} c={c} />))}
              {tab === "image" && (images.length === 0 ? <EmptyState title="No image generation yet" description="Muse image requests appear here." /> : images.map((c) => <CallRow key={c.id} c={c} />))}
              {tab === "brands" &&
                (data.brands.length === 0 ? (
                  <EmptyState title="No brands" description="Create a brand to see its stored data." />
                ) : (
                  data.brands.map((b) => (
                    <Row
                      key={b.id}
                      title={b.name}
                      meta={`Model v${b.brand_versions?.version ?? "–"} · ${b.brand_versions?.source ?? ""}`}
                      chips={
                        <span className="text-xs text-text-muted tabular-nums">
                          {b.socialPosts.total} scraped · {b.socialPosts.top} top
                        </span>
                      }
                    >
                      <p className="text-xs text-text-muted">Sources</p>
                      <Json value={b.sources} />
                      <p className="mt-3 text-xs text-text-muted">Brand model (voice, visual style, style guide, playbook)</p>
                      <Json value={b.brand_versions?.model ?? {}} />
                    </Row>
                  ))
                ))}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
