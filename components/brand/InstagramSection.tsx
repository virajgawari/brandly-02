"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, Heart, MessageCircle } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { LiveFindings } from "@/components/onboarding/kit";
import { runPipeline } from "@/lib/brand/client";
import { cleanSocial } from "@/lib/brand/socials";
import { takeQueuedInstagramLearning } from "@/lib/social/autolearn";
import { FONT_PAIRS } from "@/lib/brand/fonts";
import type { BrandModel } from "@/lib/brand/model";
import type { Finding } from "@/lib/brand/stages/types";
import type { BrandSources } from "@/lib/types";

interface TopPost {
  id: string;
  type: string | null;
  caption: string;
  likes: number;
  comments: number;
  imageUrl: string | null;
}
type Phase = "idle" | "scraping" | "learning" | "done" | "error";

const POLL_MS = 3000;
const MAX_POLLS = 100; // ~5 minutes

/**
 * Learn a brand's look and voice from its Instagram: scrape (background job) → style guide + playbook
 * (AI) → shown here and used by the composer and sprint.
 */
export function InstagramSection({
  model,
  sources,
  onModel,
  onSources,
}: {
  model: BrandModel;
  sources: BrandSources;
  /** Persist a model produced by the social pipeline. */
  onModel: (m: BrandModel) => void;
  onSources: (s: BrandSources) => void;
}) {
  const [handle, setHandle] = useState(sources.instagram ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [posts, setPosts] = useState<TopPost[]>([]);
  const [count, setCount] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const alive = useRef(true);
  const modelRef = useRef(model);
  modelRef.current = model;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadPosts = useCallback(async () => {
    const r = await fetch(`/api/brands/${encodeURIComponent(model.id)}/social`).catch(() => null);
    if (!r?.ok) return;
    const j = (await r.json()) as { enabled?: boolean; count?: number; posts?: TopPost[] };
    if (!alive.current) return;
    setEnabled(j.enabled ?? true);
    setCount(j.count ?? 0);
    setPosts(j.posts ?? []);
  }, [model.id]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  const step = (id: string, label: string, status: Finding["status"], detail?: string) =>
    setFindings((prev) => [...prev.filter((f) => f.id !== id), { id, label, status, ...(detail ? { detail } : {}) } as Finding]);

  const fail = (msg: string) => {
    setError(msg);
    setPhase("error");
  };

  const start = async () => {
    const clean = cleanSocial("instagram", handle);
    if (!clean) return fail("Enter your Instagram handle, like @yourbrand.");
    setError(null);
    setFindings([]);
    setPhase("scraping");
    if ((sources.instagram ?? "") !== clean) onSources({ ...sources, instagram: clean });
    step("scrape", `Reading @${clean} on Instagram`, "info", "This can take a minute or two.");

    const res = await fetch(`/api/brands/${encodeURIComponent(model.id)}/social`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handle: clean }),
    }).catch(() => null);
    const body = res ? ((await res.json().catch(() => ({}))) as { jobId?: string; error?: string }) : {};
    if (!res?.ok || !body.jobId) return fail(body.error ?? "Couldn't start reading Instagram. Try again.");

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (!alive.current) return;
      const jr = await fetch(`/api/jobs/${body.jobId}`).catch(() => null);
      if (!jr?.ok) continue;
      const job = (await jr.json()) as { status: string; error?: string | null; result?: { posts?: number; top?: number } };
      if (job.status === "dead") return fail(job.error || "Instagram reading failed.");
      if (job.status === "done") {
        step("scrape", `Read ${job.result?.posts ?? "your"} posts from @${clean}`, "done", `Picked the ${job.result?.top ?? 10} best performers.`);
        await learn();
        return;
      }
    }
    fail("Instagram is taking too long. Try again in a few minutes.");
  };

  const learn = async () => {
    setPhase("learning");
    await loadPosts();
    step("learn", "Learning your visual style and voice", "info", "Studying your best posts.");
    try {
      const result = await runPipeline("social", modelRef.current, {}, () => {}, undefined, undefined);
      if (!alive.current) return;
      onModel(result.model);
      step("learn", "Learned your visual style and voice", "done");
      setPhase("done");
    } catch (e) {
      fail(e instanceof Error ? e.message : "Couldn't learn from your posts.");
    }
  };

  // Onboarding queued this brand: start reading once, as soon as the server confirms scraping is available.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !enabled || !handle.trim() || phase !== "idle") return;
    if (!takeQueuedInstagramLearning(model.id)) return;
    autoStarted.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, handle, phase, model.id]);

  const busy = phase === "scraping" || phase === "learning";
  const sg = model.expression.styleGuide;
  const pb = model.voice.playbook;
  const learned = Boolean(sg || pb);

  return (
    <Card className="p-5">
      <div id="section-instagram" className="flex items-start gap-3">
        <div className="size-9 rounded-xl bg-bg border border-border grid place-items-center shrink-0">
          <Camera size={16} />
        </div>
        <div className="min-w-0">
          <h2 className="font-medium">Learn from your Instagram</h2>
          <p className="text-sm text-text-muted mt-0.5">
            We read your best posts, work out how they look and sound, and use that every time we write or design a post for you.
          </p>
        </div>
      </div>

      {!enabled ? (
        <p className="mt-4 text-sm text-warn">Instagram reading isn&apos;t set up on this server yet (missing APIFY_TOKEN).</p>
      ) : (
        <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <Input label="Instagram handle" prefix="@" placeholder="yourbrand" value={handle} disabled={busy} onChange={(e) => setHandle(e.target.value)} />
          </div>
          <Button onClick={start} loading={busy} disabled={busy}>
            {learned || count > 0 ? "Re-read Instagram" : "Learn from Instagram"}
          </Button>
        </div>
      )}

      {findings.length > 0 && (
        <div className="mt-4">
          <LiveFindings findings={findings} running={busy} />
        </div>
      )}
      {error && <p className="mt-3 text-sm text-warn">{error}</p>}

      {posts.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-medium">
            Your top posts <span className="text-text-muted font-normal">· learned from {count} posts</span>
          </p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
            {posts.map((p) => (
              <div key={p.id} className="rounded-xl border border-border overflow-hidden bg-bg">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="aspect-square grid place-items-center text-xs text-text-muted p-2 text-center">{p.caption.slice(0, 60)}</div>
                )}
                <div className="px-2 py-1.5 flex items-center gap-3 text-[11px] text-text-muted">
                  <span className="inline-flex items-center gap-1"><Heart size={11} />{p.likes.toLocaleString()}</span>
                  <span className="inline-flex items-center gap-1"><MessageCircle size={11} />{p.comments.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {learned && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {sg && (
            <div className="rounded-xl bg-bg border border-border p-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-1.5"><Check size={14} className="text-success" /> Visual style</p>
              {(["medium", "palette", "composition", "typography"] as const).map((k) => (
                <div key={k}>
                  <p className="text-[11px] uppercase tracking-wide text-text-muted">{k}</p>
                  <p className="text-sm leading-snug">{sg[k]}</p>
                </div>
              ))}
              {(sg.textColor || sg.fontPairId || sg.textBox || sg.peoplePct !== undefined) && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-text-muted">Applied to your posts</p>
                  <p className="text-sm leading-snug flex flex-wrap items-center gap-x-3 gap-y-1">
                    {sg.textColor && <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full border border-border" style={{ background: sg.textColor }} />Text {sg.textColor}</span>}
                    {sg.fontPairId && FONT_PAIRS.some((f) => f.id === sg.fontPairId) && (() => {
                      const f = FONT_PAIRS.find((x) => x.id === sg.fontPairId)!;
                      return <span>Font: {f.heading} + {f.body}</span>;
                    })()}
                    {sg.textBox && sg.textBox !== "none" && <span>Text on a {sg.textBox}</span>}
                    {sg.peoplePct !== undefined && <span>People in {sg.peoplePct}% of images{sg.peopleStyle ? ` (${sg.peopleStyle})` : ""}</span>}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Added to every image prompt</p>
                <p className="text-xs leading-snug text-text-muted">{sg.promptSuffix}</p>
              </div>
            </div>
          )}
          {pb && (
            <div className="rounded-xl bg-bg border border-border p-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-1.5"><Check size={14} className="text-success" /> Writing playbook</p>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-text-muted">What you post about</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {pb.pillars.map((p) => (
                    <span key={p.name} className="text-xs rounded-full border border-border px-2 py-0.5">{p.name} · {p.pct}%</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Sounds</p>
                <p className="text-sm">{pb.adjectives.join(", ")}</p>
                <p className="text-xs text-text-muted mt-0.5">Never: {pb.neverSoundsLike}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-text-muted">How you open</p>
                <ul className="text-sm space-y-0.5 list-disc pl-4">
                  {pb.hookFormulas.slice(0, 3).map((h) => <li key={h}>{h}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Closing and hashtags</p>
                <p className="text-sm">{pb.cta}</p>
                <p className="text-xs text-text-muted mt-0.5">{pb.hashtagRule}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {learned && !busy && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/composer"><Button>Write a post in this style</Button></Link>
          <Link href="/sprint"><Button variant="secondary">Plan a week of posts</Button></Link>
        </div>
      )}
    </Card>
  );
}
