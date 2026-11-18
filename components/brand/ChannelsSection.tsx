"use client";
import { useEffect, useState } from "react";
import { Card, Input } from "@/components/ui";
import { cleanSocial, SOCIALS, type SocialKey } from "@/lib/brand/socials";
import type { BrandSources } from "@/lib/types";

type Channel = { name: string; identifier: string };

/** Links and handles for the brand, with which ones are connected for publishing in Postiz. */
export function ChannelsSection({ sources, onSave }: { sources: BrandSources; onSave: (next: BrandSources) => void }) {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let live = true;
    fetch("/api/channels")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { enabled?: boolean; channels?: Channel[] } | null) => {
        if (!live) return;
        setEnabled(j?.enabled ?? false);
        setChannels(j?.channels ?? []);
      })
      .catch(() => live && setChannels([]));
    return () => {
      live = false;
    };
  }, []);

  const commit = (key: SocialKey, value: string) => {
    const clean = cleanSocial(key, value);
    if ((sources[key] ?? "") === clean) return;
    const next = { ...sources };
    if (clean) next[key] = clean;
    else delete next[key];
    onSave(next);
  };

  const status = (postiz?: string[]) => {
    if (!postiz) return null;
    if (!enabled) return "Publishing not set up";
    if (channels === null) return "Checking…";
    const hit = channels.find((c) => postiz.includes(c.identifier));
    return hit ? `Connected: ${hit.name}` : "Not connected for publishing";
  };

  return (
    <Card className="p-5">
      <h2 className="font-medium">Links and channels</h2>
      <p className="text-sm text-text-muted mt-0.5">Where people find you. Connect accounts for publishing in Postiz.</p>
      <div className="grid gap-4 sm:grid-cols-2 mt-5">
        {SOCIALS.map((s) => {
          const st = status(s.postiz);
          return (
            <div key={s.key}>
              <Input
                label={s.label}
                placeholder={s.placeholder}
                prefix={s.key === "instagram" || s.key === "x" ? "@" : undefined}
                defaultValue={sources[s.key] ?? ""}
                onBlur={(e) => commit(s.key, e.target.value)}
              />
              {st && <p className="text-xs text-text-muted mt-1">{st}</p>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
