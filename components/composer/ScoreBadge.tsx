"use client";
import { useMemo, useState } from "react";
import { hashtagRange } from "@/lib/content/hashtags";
import { FIT_PASS } from "@/lib/judge/config";
import { FEED_PASS, FEED_WARN, scoreFeedMatch } from "@/lib/judge/feed";
import type { BrandModel } from "@/lib/brand/model";
import type { GeneratedPost } from "@/lib/types";
import { Scorecard } from "./Scorecard";

const tone = (n: number, pass: number, warn: number) => (n >= pass ? "text-success" : n >= warn ? "text-warn" : "text-error");

function Ring({ label, value, pass, warn }: { label: string; value: number | null; pass: number; warn: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden className={value === null ? "text-text-muted" : tone(v, pass, warn)}>
        <circle cx="19" cy="19" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="4" />
        {value !== null && (
          <circle cx="19" cy="19" r={r} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform="rotate(-90 19 19)" />
        )}
        <text x="19" y="23" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor">{value === null ? "–" : v}</text>
      </svg>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

/** Two rings under a post: Brand match (judge fit) and Feed match (vs the learned Instagram playbook). Click for the breakdown. */
export function ScoreBadge({ post, model }: { post: GeneratedPost; model: BrandModel }) {
  const [open, setOpen] = useState(false);
  const fit = post.check?.fit;
  const brandScore = fit && fit.status === "ok" ? (fit.fit ?? null) : null;
  const caption = post.caption ?? "";
  const feed = useMemo(
    () => scoreFeedMatch({ caption, hashtags: post.hashtags, cta: post.cta, format: post.format }, model.voice.playbook, hashtagRange(model)),
    [caption, post.hashtags, post.cta, post.format, model],
  );
  const feedScore = feed.status === "ok" ? feed.score : null;

  return (
    <div className="max-w-[380px] mx-auto">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center justify-center gap-6 rounded-xl bg-surface px-4 py-2 hover:bg-text/5">
        <Ring label="Brand match" value={brandScore} pass={FIT_PASS} warn={FIT_PASS - 15} />
        <Ring label="Feed match" value={feedScore} pass={FEED_PASS} warn={FEED_WARN} />
      </button>
      {post.check && !post.check.rules.passed && (
        <p className="mt-1 text-xs text-error text-center">Check this before posting: {post.check.rules.failures[0]?.replace(/\. Remove them.*$/, "")}</p>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          <div className="rounded-xl bg-surface p-4 text-sm space-y-2">
            <p className="font-semibold">Feed match {feedScore ?? ""}</p>
            {feed.status === "unavailable" ? (
              <p className="text-text-muted">Learn from Instagram (Brand, Voice) to enable this score.</p>
            ) : (
              feed.parts.map((p) => (
                <div key={p.id}>
                  <div className="flex justify-between text-xs"><span className="font-medium">{p.label}</span><span className="text-text-muted">{p.score}</span></div>
                  <div className="h-1.5 rounded bg-text/10 overflow-hidden"><div className={`h-full ${p.score >= FEED_PASS ? "bg-success" : p.score >= FEED_WARN ? "bg-warn" : "bg-error"}`} style={{ width: `${p.score}%` }} /></div>
                  <p className="text-xs text-text-muted mt-0.5">{p.detail}</p>
                </div>
              ))
            )}
            <p className="text-xs text-text-muted">Scored without AI by comparing this post with how the brand&apos;s feed is written. It updates as you edit.</p>
          </div>
          {post.check && <Scorecard check={post.check} text={[post.headline, post.caption].filter(Boolean).join("\n")} />}
        </div>
      )}
    </div>
  );
}
