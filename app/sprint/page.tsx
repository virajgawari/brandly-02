"use client";
import { useState } from "react";
import Link from "next/link";
import { addDays } from "date-fns";
import AppShell from "@/components/layout/AppShell";
import { Button, Card, EmptyState, Input, PageHeader, SectionLabel, Textarea } from "@/components/ui";
import { useStore } from "@/lib/store";
import { campaignTopic, CAMPAIGN_RATIOS, maxCampaignCalls, type CampaignBrief, type CampaignRatio } from "@/lib/content/campaign";
import type { GeneratedPost, Platform, RenderedMedia, ScheduledPost, TemplateCategory } from "@/lib/types";

const SIZE_OF: Record<CampaignRatio, RenderedMedia["size"]> = { "4:5": "1080x1350", "1:1": "1080x1080", "9:16": "1080x1920" };

type Slot = { status: "writing" | "done" | "failed"; id?: string; post?: GeneratedPost; generationId?: string; error?: string; imaging?: boolean };

/** Sprint: one sentence in, an editable brief, then a short run of posts that build on each other. */
export default function SprintPage() {
  const { getActiveBrand, addPost } = useStore();
  const brand = getActiveBrand();
  const [request, setRequest] = useState("");
  const [brief, setBrief] = useState<CampaignBrief | null>(null);
  const [planning, setPlanning] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calls, setCalls] = useState(0);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const platforms: Platform[] = ["instagram"];

  if (!brand?.model) {
    return (
      <AppShell>
        <EmptyState title="No brand yet" description="Set up your brand to plan a sprint." action={<Link href="/onboarding"><Button>Set up your brand</Button></Link>} />
      </AppShell>
    );
  }
  const model = brand.model;

  const plan = async () => {
    setPlanning(true);
    setError(null);
    setBrief(null);
    setSlots([]);
    setSaved(false);
    try {
      const res = await fetch("/api/campaign/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandModel: model, request }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.brief) throw new Error(data.error ?? "Couldn't plan the sprint just now.");
      setBrief(data.brief as CampaignBrief);
      setCalls(data.llmCalls ?? 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setPlanning(false);
  };

  const patchPost = (i: number, patch: Partial<CampaignBrief["posts"][number]>) =>
    setBrief((b) => (b ? { ...b, posts: b.posts.map((p, j) => (j === i ? { ...p, ...patch } : p)) } : b));

  // Each post goes through generate-post in parallel, so each gets its own 60 s window.
  const run = async () => {
    if (!brief) return;
    const t0 = Date.now();
    setRunning(true);
    setSaved(false);
    setError(null);
    setSlots(brief.posts.map(() => ({ status: "writing" })));
    await Promise.all(
      brief.posts.map(async (p, i) => {
        let slot: Slot;
        try {
          const res = await fetch("/api/generate-post", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brandDNA: brand.dna, brandModel: model, template: p.template, topic: campaignTopic(brief, p), platforms }),
          });
          const data = await res.json().catch(() => ({}));
          slot = data.post ? { status: "done", id: crypto.randomUUID(), post: data.post, generationId: data.generationId, imaging: true } : { status: "failed", error: data.error ?? "Couldn't write this one." };
        } catch (e) {
          slot = { status: "failed", error: e instanceof Error ? e.message : String(e) };
        }
        setSlots((s) => s.map((x, j) => (j === i ? slot : x)));
        if (slot.status !== "done" || !slot.post) return;
        // Make the image right away so the sprint shows finished posts, not just text.
        let post = slot.post;
        try {
          const res = await fetch("/api/render-post", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brandModel: model, post, layout: post.layout, photo: "auto", size: SIZE_OF[brief.ratio], store: true, key: slot.id }),
          });
          const data = await res.json().catch(() => ({}));
          if (data.rendered) post = { ...post, layout: data.rendered.layout, rendered: data.rendered };
        } catch {
          /* keep the text; it can be opened in Create */
        }
        setSlots((s) => s.map((x, j) => (j === i ? { ...x, post, imaging: false } : x)));
      })
    );
    setSeconds(Math.round((Date.now() - t0) / 1000));
    setRunning(false);
  };

  // Draft calls: 1 brief + up to 4 per post; a post that wrote counts at least 2 (write + judge).
  const written = slots.filter((s) => s.status === "done").length;

  const saveAll = async () => {
    if (!brief) return;
    setSaving(true);
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.status !== "done" || !s.post) continue;
      const id = s.id ?? crypto.randomUUID();
      const content: GeneratedPost = s.post;
      const scheduled: ScheduledPost = {
        id,
        brandId: brand.id,
        content,
        generationId: s.generationId,
        platforms,
        scheduledAt: addDays(new Date(), i + 1).toISOString(),
        status: "draft",
        createdAt: new Date().toISOString(),
        ...(content.rendered?.urls[0] ? { mediaUrl: content.rendered.urls[0] } : {}),
      };
      addPost(scheduled, { template: brief.posts[i].template as TemplateCategory, topic: brief.posts[i].title });
    }
    setSaving(false);
    setSaved(true);
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-6">
        <PageHeader title="Sprint" subtitle="Describe a push in one sentence. Brandly plans four posts that build on each other." />

        <Card className="p-5 space-y-3">
          <Textarea label="What are you pushing?" value={request} onChange={(e) => setRequest(e.target.value)} placeholder="e.g. Launch our new cold brew next week and get people to try it" rows={2} />
          <Button loading={planning} disabled={request.trim().length < 5} onClick={plan}>Plan sprint</Button>
          {error && <p className="text-sm text-error">{error}</p>}
        </Card>

        {brief && (
          <Card className="p-5 space-y-4">
            <SectionLabel>Plan (edit anything, then confirm)</SectionLabel>
            <Input label="Goal" value={brief.goal} onChange={(e) => setBrief({ ...brief, goal: e.target.value })} />
            <div className="grid sm:grid-cols-2 gap-3">
              <Input label="Offer" hint="Only if you have a real one" value={brief.offer} onChange={(e) => setBrief({ ...brief, offer: e.target.value })} />
              <Input label="Product" value={brief.product} onChange={(e) => setBrief({ ...brief, product: e.target.value })} />
            </div>
            <div className="flex gap-2">
              {CAMPAIGN_RATIOS.map((r) => (
                <button key={r} onClick={() => setBrief({ ...brief, ratio: r })} className={`px-3 py-1.5 rounded-lg border text-xs ${brief.ratio === r ? "bg-accent/10 border-accent/40" : "border-border text-text-muted"}`}>
                  {r === "9:16" ? "Story 9:16" : r}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {brief.posts.map((p, i) => (
                <div key={i} className="rounded-xl border border-border p-3 space-y-2">
                  <Input label={`Post ${i + 1}`} value={p.title} onChange={(e) => patchPost(i, { title: e.target.value })} />
                  <Input value={p.pitch} onChange={(e) => patchPost(i, { pitch: e.target.value })} />
                  {slots[i]?.status === "writing" && <p className="text-xs text-text-muted">Writing…</p>}
                  {slots[i]?.status === "failed" && <p className="text-xs text-error">{slots[i].error}</p>}
                  {slots[i]?.imaging && <p className="text-xs text-text-muted">Making the image…</p>}
                  {slots[i]?.post?.rendered?.urls[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slots[i].post!.rendered!.urls[0]} alt={slots[i].post!.headline || `Post ${i + 1}`} className="w-40 rounded-lg border border-border" />
                  )}
                  {slots[i]?.post && (
                    <div className="text-sm bg-surface-2 rounded-lg p-3">
                      {slots[i].post!.headline && <p className="font-medium">{slots[i].post!.headline}</p>}
                      <p className="text-text-muted whitespace-pre-line">{slots[i].post!.caption}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button loading={running} onClick={run}>{slots.length ? "Write again" : "Confirm and write posts"}</Button>
              {written > 0 && !running && !slots.some((x) => x.imaging) && (
                <Button variant="secondary" loading={saving} disabled={saved} onClick={saveAll}>
                  {saved ? "Saved to calendar" : `Save ${written} as drafts`}
                </Button>
              )}
              {saved && <Link href="/calendar" className="text-sm text-accent">Open calendar</Link>}
            </div>
            <p className="text-xs text-text-muted">
              {seconds !== null ? `Took ${seconds}s. ` : ""}
              Plan used {calls} call. Writing the posts takes about {maxCampaignCalls(brief.posts.length) - 1} more (writing, checking and rewrites).
            </p>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
