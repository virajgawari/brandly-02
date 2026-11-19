"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Pencil, Sprout, Store } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Button, Card } from "@/components/ui";
import { useStore } from "@/lib/store";
import { loadGoogleFonts } from "@/lib/brand/client";
import type { Brand } from "@/lib/types";

/** Home: the active brand, as an overview and its details. Switch brands from the sidebar. */
export default function HomeClient() {
  const { brands, getActiveBrand } = useStore();
  const brand = getActiveBrand();
  if (!brands.length || !brand) return <FirstRun />;
  return <BrandHome brand={brand} />;
}

function FirstRun() {
  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <h1 className="text-3xl font-semibold tracking-tight">Posts that sound like you, every week.</h1>
        <p className="text-text-muted mt-3 text-[15px] leading-relaxed max-w-lg">
          Brandly learns your brand once, then writes, plans and schedules your social posts. Start with what you have.
        </p>
        <div className="mt-10 grid sm:grid-cols-2 gap-3">
          <Link href="/onboarding" className="rounded-2xl border border-border bg-card p-5 hover:border-text/30 transition-colors">
            <Store size={20} strokeWidth={1.75} />
            <p className="font-medium mt-3">I have a website or Instagram</p>
            <p className="text-sm text-text-muted mt-1">We read your colours, fonts and voice in about a minute.</p>
          </Link>
          <Link href="/onboarding?door=build" className="rounded-2xl border border-border bg-card p-5 hover:border-text/30 transition-colors">
            <Sprout size={20} strokeWidth={1.75} />
            <p className="font-medium mt-3">I&apos;m starting from scratch</p>
            <p className="text-sm text-text-muted mt-1">Answer a few questions and pick one of three directions.</p>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-text-muted mb-2">{children}</p>;
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((v) => (
        <span key={v} className="rounded-full border border-border px-2.5 py-1 text-xs">
          {v}
        </span>
      ))}
    </div>
  );
}

function BrandHome({ brand }: { brand: Brand }) {
  const brandId = brand.id;
  const model = brand.model;
  const dna = brand.dna;
  const expr = model?.expression;
  const logo = expr?.logoUrl;
  const fonts = { heading: expr?.tokens.font.heading.$value ?? "", body: expr?.tokens.font.body.$value ?? "" };
  const colors = (["primary", "secondary", "accent", "neutral"] as const).map((role) => ({ role, hex: dna.colors[role] }));
  const mission = model?.identity.mission;
  const offering = model?.strategy.offering;
  const differentiators = model?.strategy.differentiators ?? [];

  useEffect(() => loadGoogleFonts([fonts.heading, fonts.body].filter(Boolean)), [fonts.heading, fonts.body]);

  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const photoKey = (expr?.photos ?? []).slice(0, 8).map((p) => p.path).join("|");
  useEffect(() => {
    if (!photoKey) return;
    let live = true;
    const q = photoKey.split("|").map((p) => `path=${encodeURIComponent(p)}`).join("&");
    fetch(`/api/brands/${brandId}/photos?${q}`)
      .then((r) => r.json())
      .then((d: { photos?: { url: string }[] }) => live && setPhotoUrls((d.photos ?? []).map((p) => p.url)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [brandId, photoKey]);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
          <div className="flex items-center gap-4 min-w-0">
            <span className="w-14 h-14 rounded-xl border border-border bg-card grid place-items-center overflow-hidden shrink-0 text-lg font-semibold">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={`${brand.name} logo`} className="w-full h-full object-contain p-1.5" />
              ) : (
                brand.name.slice(0, 1).toUpperCase()
              )}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-text-muted">Brand</p>
              <h1 className="text-2xl font-semibold tracking-tight break-words">{brand.name}</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/brand">
              <Button variant="secondary">
                <Pencil size={14} /> Edit brand
              </Button>
            </Link>
            <Link href="/composer">
              <Button>
                Write a post <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>

        {/* Overview */}
        <section aria-labelledby="overview">
          <h2 id="overview" className="text-lg font-semibold tracking-tight mb-3">
            Overview
          </h2>
          <Card className="p-6">
            {dna.one_liner && <p className="text-xl leading-snug tracking-tight max-w-2xl">{dna.one_liner}</p>}
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {(offering || dna.products_services.length > 0) && (
                <div>
                  <Label>What you offer</Label>
                  <p className="text-sm leading-relaxed">{offering || dna.products_services.join(", ")}</p>
                </div>
              )}
              {dna.target_audience && (
                <div>
                  <Label>Who it&apos;s for</Label>
                  <p className="text-sm leading-relaxed">{dna.target_audience}</p>
                </div>
              )}
              {mission && (
                <div>
                  <Label>Mission</Label>
                  <p className="text-sm leading-relaxed">{mission}</p>
                </div>
              )}
              {dna.communication_tone && (
                <div>
                  <Label>How you sound</Label>
                  <p className="text-sm leading-relaxed">{dna.communication_tone}</p>
                </div>
              )}
            </div>
            {differentiators.length > 0 && (
              <div className="mt-6">
                <Label>What sets you apart</Label>
                <Chips items={differentiators.slice(0, 6)} />
              </div>
            )}
            {dna.vibe.length > 0 && (
              <div className="mt-6">
                <Label>Brand feel</Label>
                <Chips items={dna.vibe.slice(0, 8)} />
              </div>
            )}
          </Card>
        </section>

        {/* Details */}
        <section aria-labelledby="details" className="mt-10">
          <h2 id="details" className="text-lg font-semibold tracking-tight mb-3">
            Details
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <Label>Colours</Label>
              <div className="grid grid-cols-4 gap-2">
                {colors.map((c) => (
                  <div key={c.role}>
                    <span className="block h-14 rounded-lg border border-border" style={{ background: c.hex }} />
                    <p className="text-[11px] mt-1.5 capitalize text-text-muted">{c.role}</p>
                    <p className="text-[11px] tabular-nums uppercase">{c.hex}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <Label>Fonts</Label>
              {fonts.heading ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-2xl" style={{ fontFamily: `'${fonts.heading}', serif` }}>
                      {fonts.heading}
                    </p>
                    <p className="text-[11px] text-text-muted">Headings</p>
                  </div>
                  <div>
                    <p className="text-base" style={{ fontFamily: `'${fonts.body}', sans-serif` }}>
                      {fonts.body}
                    </p>
                    <p className="text-[11px] text-text-muted">Body</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text-muted">{dna.typography_feel || "No fonts set yet."}</p>
              )}
            </Card>

            <Card className="p-5">
              <Label>Voice</Label>
              {dna.do.length === 0 && dna.dont.length === 0 ? (
                <p className="text-sm text-text-muted">No voice rules yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[11px] text-text-muted mb-1">Do</p>
                    <ul className="space-y-1">
                      {dna.do.slice(0, 4).map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-muted mb-1">Don&apos;t</p>
                    <ul className="space-y-1">
                      {dna.dont.slice(0, 4).map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <Label>Content themes</Label>
              {dna.content_themes.length ? <Chips items={dna.content_themes.slice(0, 8)} /> : <p className="text-sm text-text-muted">No themes yet.</p>}
              {dna.products_services.length > 0 && (
                <div className="mt-5">
                  <Label>Products and services</Label>
                  <Chips items={dna.products_services.slice(0, 8)} />
                </div>
              )}
            </Card>

            <Card className="p-5 md:col-span-2">
              <Label>Photos</Label>
              {photoUrls.length > 0 ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {photoUrls.map((u) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={u} src={u} alt="" className="aspect-square w-full rounded-lg object-cover" />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted">
                  No photos yet.{" "}
                  <Link href="/brand" className="underline underline-offset-2 hover:text-text">
                    Add some
                  </Link>
                </p>
              )}
            </Card>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
