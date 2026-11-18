"use client";
import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { PLATFORM_LABELS } from "@/lib/templates";
import type { Platform } from "@/lib/types";

const FIELDS = [
  ["reach", "Reach"],
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["shares", "Shares"],
  ["saves", "Saves"],
] as const;

type Saved = { platform: string; reach: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null };

/** Type in the numbers from a platform's insights screen so the agent can learn from real results. */
export default function PostMetricsForm({ postId, platforms }: { postId: string; platforms: string[] }) {
  const [platform, setPlatform] = useState(platforms[0] ?? "instagram");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Saved[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch(`/api/posts/${postId}/metrics`).catch(() => null);
    if (res?.ok) setSaved((await res.json()).metrics ?? []);
  }
  useEffect(() => {
    setVals({});
    setMsg("");
    setPlatform(platforms[0] ?? "instagram");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  async function save() {
    setBusy(true);
    setMsg("");
    const body: Record<string, unknown> = { platform };
    for (const [k] of FIELDS) if (vals[k] !== undefined && vals[k] !== "") body[k] = Number(vals[k]);
    const res = await fetch(`/api/posts/${postId}/metrics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setVals({});
      setMsg("Saved. The agent will use it on its next run.");
      void load();
    } else {
      setMsg(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not save.");
    }
  }

  const current = saved.find((m) => m.platform === platform);
  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="text-xs font-medium text-text mb-2">How did it do?</p>
      {platforms.length > 1 && (
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="mb-2 w-full rounded-md border border-border bg-surface px-2 py-1 text-xs">
          {platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p as Platform] ?? p}</option>)}
        </select>
      )}
      {current && (
        <p className="text-[11px] text-text-muted mb-2">
          Last entered: reach {current.reach ?? "–"}, likes {current.likes ?? "–"}, comments {current.comments ?? "–"}, shares {current.shares ?? "–"}, saves {current.saves ?? "–"}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map(([k, label]) => (
          <Input key={k} label={label} type="number" min={0} inputMode="numeric" value={vals[k] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} />
        ))}
      </div>
      <Button size="sm" className="mt-2" loading={busy} onClick={save}>Save numbers</Button>
      {msg && <p className="mt-2 text-[11px] text-text-muted">{msg}</p>}
    </div>
  );
}
