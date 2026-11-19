"use client";
import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { useStore } from "@/lib/store";

async function patch(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch("/api/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  return !!res?.ok;
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 py-2 cursor-pointer">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm">
        {label}
        <span className="block text-xs text-text-muted">{hint}</span>
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const account = useStore((s) => s.account);
  const hydrate = useStore((s) => s.hydrate);
  const [name, setName] = useState(account?.user.name ?? "");
  const [wsName, setWsName] = useState(account?.workspace.name ?? "");
  const [msg, setMsg] = useState("");
  const [training, setTraining] = useState(account?.workspace.data_training_opt_in ?? false);
  const [watermark, setWatermark] = useState(account?.workspace.ai_watermark ?? false);
  const [prefs, setPrefs] = useState({ weekly: account?.workspace.email_prefs?.weekly ?? true, product: account?.workspace.email_prefs?.product ?? false });

  if (!account) return <AppShell><div className="p-8 text-sm text-text-muted">Sign in to see your settings.</div></AppShell>;
  const canEdit = account.role === "owner" || account.role === "admin";

  const flash = (ok: boolean) => setMsg(ok ? "Saved." : "Couldn't save, try again.");
  const toggle = async (body: Record<string, unknown>, revert: () => void) => {
    const ok = await patch(body);
    if (!ok) revert();
    flash(ok);
  };

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-8 space-y-6">
        <PageHeader title="Settings" subtitle={account.user.email} />
        {msg && <p role="status" className="text-sm text-text-muted">{msg}</p>}

        <Card className="p-5 space-y-4">
          <h2 className="font-medium">Profile</h2>
          <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Workspace name" value={wsName} disabled={!canEdit} onChange={(e) => setWsName(e.target.value)} />
          <Button
            onClick={async () => {
              const ok = await patch({ fullName: name, ...(canEdit ? { name: wsName } : {}) });
              if (ok) await hydrate();
              flash(ok);
            }}
          >
            Save
          </Button>
        </Card>

        <Card className="p-5">
          <h2 className="font-medium mb-1">Posts</h2>
          <Toggle
            label="Add a “Made with AI” label to images"
            hint="Stamped in the corner of every rendered post. Off by default."
            checked={watermark}
            onChange={(v) => {
              setWatermark(v);
              toggle({ aiWatermark: v }, () => setWatermark(!v));
            }}
          />
        </Card>

        <Card className="p-5">
          <h2 className="font-medium mb-1">Privacy</h2>
          <Toggle
            label="Help improve Brandly"
            hint="Let us use this workspace's edits and ratings to improve the AI."
            checked={training}
            onChange={(v) => {
              setTraining(v);
              toggle({ dataTrainingOptIn: v }, () => setTraining(!v));
            }}
          />
          <div className="pt-3">
            <a href="/api/export" download>
              <Button variant="secondary">Download my data</Button>
            </a>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-medium mb-1">Email</h2>
          <Toggle
            label="Weekly summary"
            hint="What worked and what Brandly learned."
            checked={prefs.weekly}
            onChange={(v) => {
              const next = { ...prefs, weekly: v };
              setPrefs(next);
              toggle({ emailPrefs: next }, () => setPrefs(prefs));
            }}
          />
          <Toggle
            label="Product news"
            hint="New features, rarely."
            checked={prefs.product}
            onChange={(v) => {
              const next = { ...prefs, product: v };
              setPrefs(next);
              toggle({ emailPrefs: next }, () => setPrefs(prefs));
            }}
          />
        </Card>
      </div>
    </AppShell>
  );
}
