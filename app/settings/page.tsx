"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { useStore, markTimezoneChosen } from "@/lib/store";

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

type Member = { userId: string; role: string; email: string; name: string };
type Invite = { id: string; email: string; role: string; link: string };

function TeamCard({ canInvite }: { canInvite: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");

  const load = async () => {
    const res = await fetch("/api/workspace/invites").catch(() => null);
    if (!res?.ok) return;
    const d = await res.json();
    setMembers(d.members ?? []);
    setInvites(d.invites ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const invite = async () => {
    setErr("");
    const res = await fetch("/api/workspace/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role }) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) return setErr(d?.error ?? "Couldn't create the invite, try again.");
    setEmail("");
    await load();
  };
  const revoke = async (id: string) => {
    await fetch(`/api/workspace/invites?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    await load();
  };
  const copy = async (link: string, id: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      window.prompt("Copy this invite link", link);
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <h2 className="font-medium">Team</h2>
      <ul className="text-sm divide-y divide-border">
        {members.map((m) => (
          <li key={m.userId} className="flex justify-between py-2">
            <span>{m.name || m.email}<span className="block text-xs text-text-muted">{m.email}</span></span>
            <span className="text-text-muted">{m.role}</span>
          </li>
        ))}
      </ul>
      {canInvite && (
        <>
          {invites.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-text-muted">Pending invites. Share the link yourself; no email is sent.</p>
              {invites.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{i.email} · {i.role}</span>
                  <span className="flex gap-2 shrink-0">
                    <Button variant="secondary" onClick={() => copy(i.link, i.id)}>{copied === i.id ? "Copied" : "Copy link"}</Button>
                    <Button variant="secondary" onClick={() => revoke(i.id)}>Revoke</Button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-48">
              <Input label="Invite by email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <select aria-label="Role" className="h-10 rounded-md border border-border bg-transparent px-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <Button onClick={invite}>Create invite</Button>
          </div>
          {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        </>
      )}
    </Card>
  );
}

type Account = NonNullable<ReturnType<typeof useStore.getState>["account"]>;

/** Wrapper so the form mounts only once the account has loaded and its state starts from real values. */
export default function SettingsPage() {
  const account = useStore((s) => s.account);
  if (!account) return <AppShell><div className="p-8 text-sm text-text-muted">Sign in to see your settings.</div></AppShell>;
  return <SettingsForm account={account} />;
}

function SettingsForm({ account }: { account: Account }) {
  const hydrate = useStore((s) => s.hydrate);
  const [name, setName] = useState(account?.user.name ?? "");
  const [wsName, setWsName] = useState(account?.workspace.name ?? "");
  const [msg, setMsg] = useState("");
  const [training, setTraining] = useState(account?.workspace.data_training_opt_in ?? false);
  const [watermark, setWatermark] = useState(account?.workspace.ai_watermark ?? false);
  const [prefs, setPrefs] = useState({ weekly: account?.workspace.email_prefs?.weekly ?? true, product: account?.workspace.email_prefs?.product ?? false });

  const [timezone, setTimezone] = useState(account?.workspace.timezone ?? "UTC");
  // The workspace timezone can change after this form mounts (browser auto-detect), so follow it.
  const savedTimezone = account?.workspace.timezone;
  useEffect(() => {
    if (savedTimezone) setTimezone(savedTimezone);
  }, [savedTimezone]);
  const zones = (() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return all.includes(timezone) ? all : [timezone, ...all];
  })();
  const [postizKey, setPostizKey] = useState("");
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
          <label className="block text-sm">
            <span className="block mb-1 text-text-muted">Timezone (automations run at your local time)</span>
            <select
              className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
              value={timezone}
              disabled={!canEdit}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {zones.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </label>
          <Button
            onClick={async () => {
              const ok = await patch({ fullName: name, ...(canEdit ? { name: wsName, timezone } : {}) });
              if (ok && canEdit) markTimezoneChosen();
              if (ok) await hydrate();
              flash(ok);
            }}
          >
            Save
          </Button>
        </Card>

        <TeamCard canInvite={canEdit} />

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

        {canEdit && (
          <Card className="p-5 space-y-3">
            <h2 className="font-medium">Publishing</h2>
            <p className="text-xs text-text-muted">Paste this workspace&apos;s Postiz API key. It is stored server-side and never shown again; leave blank and save to remove it.</p>
            <Input label="Postiz API key" type="password" autoComplete="off" value={postizKey} onChange={(e) => setPostizKey(e.target.value)} />
            <Button
              onClick={async () => {
                const ok = await patch({ postizApiKey: postizKey });
                if (ok) setPostizKey("");
                flash(ok);
              }}
            >
              Save key
            </Button>
          </Card>
        )}

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
