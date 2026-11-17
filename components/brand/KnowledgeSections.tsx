"use client";
import { useState } from "react";
import clsx from "clsx";
import { Input, Select, Textarea } from "@/components/ui";
import { ChipGroup } from "@/components/onboarding/kit";
import { ListEditor, ScaleSlider, Section } from "@/components/brand/editors";
import { CITY_TIER_LABELS } from "@/lib/brand/audience";
import { effectiveTone, TONE_KEYS } from "@/lib/brand/scale";
import type { BrandModel, CityTier, ModelPatch, Tone } from "@/lib/brand/model";
import type { Platform } from "@/lib/types";

export interface SectionProps {
  model: BrandModel;
  edit: (patch: ModelPatch) => void;
  onLock: (path: string, locked: boolean) => void;
}

const ARCHETYPES = ["Innocent", "Sage", "Explorer", "Outlaw", "Magician", "Hero", "Lover", "Jester", "Everyman", "Caregiver", "Ruler", "Creator"];

/** Text box that saves on blur when the value changed. `key` remounts it when the saved value changes elsewhere. */
function Text({ label, value, rows, onSave, hint }: { label: string; value: string; rows?: number; onSave: (v: string) => void; hint?: string }) {
  const props = {
    label,
    hint,
    defaultValue: value,
    onBlur: (e: React.FocusEvent<HTMLInputElement & HTMLTextAreaElement>) => e.target.value !== value && onSave(e.target.value),
  };
  return rows ? <Textarea key={value} rows={rows} {...props} /> : <Input key={value} {...props} />;
}

const Label = ({ children }: { children: React.ReactNode }) => <p className="text-sm font-medium mb-2">{children}</p>;

/** Mission, category and positioning. */
export function PositioningSection({ model, edit, onLock }: SectionProps) {
  const s = model.strategy;
  return (
    <Section id="strategy" title="Positioning" description="Why you exist and why people pick you" model={model} onLock={onLock}>
      <div className="space-y-5">
        <Text label="Mission" rows={2} value={model.identity.mission} onSave={(v) => edit({ identity: { mission: v } })} />
        <Text label="Category" value={s.category} onSave={(v) => edit({ strategy: { category: v } })} />
        <Text label="Problem you solve" rows={2} value={s.problem} onSave={(v) => edit({ strategy: { problem: v } })} />
        <div>
          <Label>What makes you different</Label>
          <ListEditor items={s.differentiators} onChange={(v) => edit({ strategy: { differentiators: v } })} placeholder="Add a difference" />
        </div>
        <div>
          <Label>Proof (awards, numbers, customers)</Label>
          <ListEditor items={s.proofPoints} onChange={(v) => edit({ strategy: { proofPoints: v } })} placeholder="Add a proof point" />
        </div>
        <div>
          <Label>Competitors</Label>
          <ListEditor items={s.competitors} onChange={(v) => edit({ strategy: { competitors: v } })} placeholder="Add a competitor" />
        </div>
      </div>
    </Section>
  );
}

/** Archetype and the six-facet brand identity. */
export function IdentitySection({ model, edit, onLock }: SectionProps) {
  const id = model.identity;
  const known = ARCHETYPES.includes(id.archetype ?? "");
  const options = [...(id.archetype && !known ? [id.archetype] : []), ...ARCHETYPES].map((a) => ({ key: a, label: a }));
  const facets = [
    ["physique", "What it looks like (products, places, things you can see)"],
    ["personality", "Its character, as if it were a person"],
    ["culture", "Values and beliefs behind it"],
    ["relationship", "How it treats customers"],
    ["reflection", "Who customers think buys it"],
    ["selfImage", "How customers feel about themselves when they buy"],
  ] as const;
  return (
    <Section id="identity.prism" title="Brand character" description="Used to keep every post sounding like the same brand" model={model} onLock={onLock}>
      <div className="space-y-5">
        <Select label="Brand archetype" options={options} value={id.archetype ?? ""} onChange={(v) => edit({ identity: { archetype: v } })} />
        {facets.map(([k, label]) => (
          <Text key={k} label={label} rows={2} value={id.prism[k]} onSave={(v) => edit({ identity: { prism: { [k]: v } } })} />
        ))}
      </div>
    </Section>
  );
}

const PERSONALITY: { key: keyof BrandModel["personality"]; left: string; right: string }[] = [
  { key: "sincerity", left: "Not very down-to-earth", right: "Down-to-earth, honest" },
  { key: "excitement", left: "Calm", right: "Daring, energetic" },
  { key: "competence", left: "Casual about quality", right: "Reliable, expert" },
  { key: "sophistication", left: "Everyday", right: "Premium, polished" },
  { key: "ruggedness", left: "Soft, indoor", right: "Tough, outdoorsy" },
];

/** Interval and note for a field a judge rated from site copy; undefined otherwise. */
export function ratedInfo(model: BrandModel, path: string) {
  const m = model.meta[path];
  if (m?.method !== "rated") return undefined;
  return { interval: m.interval, note: m.note, confidence: m.confidence };
}

/** Places where the site copy disagrees with the profile. "Use N" takes the rated value; "Keep mine" locks the field. */
function Disagreements({ model, edit, onLock, prefix }: SectionProps & { prefix: string }) {
  const items = (model.measures?.contradictions ?? []).filter((c) => c.path.startsWith(prefix) && !model.meta[c.path]?.locked);
  if (!items.length) return null;
  const use = (path: string, n: number) => {
    const [layer, a, b] = path.split(".");
    edit((b ? { [layer]: { [a]: { [b]: n } } } : { [layer]: { [a]: n } }) as ModelPatch);
  };
  return (
    <ul className="mb-5 space-y-3 text-sm">
      {items.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 border-warn pl-3">
          <span className="flex-1 min-w-[16rem]">{c.text}</span>
          {c.suggested !== undefined && (
            <button className="h-8 px-3 rounded-md border border-border hover:border-text/30" onClick={() => use(c.path, c.suggested!)}>
              Use {c.suggested}
            </button>
          )}
          <button className="h-8 px-3 rounded-md border border-border hover:border-text/30" onClick={() => onLock(c.path, true)}>
            Keep mine
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PersonalitySection({ model, edit, onLock }: SectionProps) {
  return (
    <Section id="personality" title="Personality" description="How the brand comes across, as a person" model={model} onLock={onLock}>
      <Disagreements model={model} edit={edit} onLock={onLock} prefix="personality." />
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
        {PERSONALITY.map((p) => (
          <ScaleSlider key={p.key} left={p.left} right={p.right} value={model.personality[p.key]} onChange={(v) => edit({ personality: { [p.key]: v } })} rated={ratedInfo(model, `personality.${p.key}`)} />
        ))}
      </div>
    </Section>
  );
}

/** Style words and distinctive assets. */
export function LookSection({ model, edit, onLock }: SectionProps) {
  const x = model.expression;
  return (
    <Section id="expression.style" title="Look and feel" description="Described in words, used when writing image prompts" model={model} onLock={onLock}>
      <div className="space-y-5">
        <Text label="Visual style" rows={2} value={x.visualStyle} onSave={(v) => edit({ expression: { visualStyle: v } })} />
        <Text label="Photo and image style" rows={2} value={x.imageryStyle} onSave={(v) => edit({ expression: { imageryStyle: v } })} />
        <Text label="Typography feel" value={x.typographyFeel} onSave={(v) => edit({ expression: { typographyFeel: v } })} />
        <Text label="Logo notes" value={x.logoNotes ?? ""} onSave={(v) => edit({ expression: { logoNotes: v } })} />
        <div>
          <Label>Distinctive assets (patterns, mascots, taglines)</Label>
          <ListEditor items={x.distinctiveAssets} onChange={(v) => edit({ expression: { distinctiveAssets: v } })} placeholder="Add an asset" />
        </div>
      </div>
    </Section>
  );
}

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "twitter", label: "X / Twitter" },
];
const TONE_WORDS: Record<keyof Tone, [string, string]> = {
  funny_serious: ["Funny", "Serious"],
  formal_casual: ["Formal", "Casual"],
  respectful_irreverent: ["Respectful", "Cheeky"],
  enthusiastic_matter: ["Enthusiastic", "Matter-of-fact"],
};

/** Words to use and avoid, sample lines, and a tone per platform. */
export function WordsSection({ model, edit, save, onLock }: SectionProps & { save: (m: BrandModel) => void }) {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const v = model.voice;
  const override = v.toneByPlatform?.[platform];
  const tone = effectiveTone(model, platform);
  const reset = () => {
    const rest = { ...(v.toneByPlatform ?? {}) };
    delete rest[platform];
    save({ ...model, voice: { ...v, toneByPlatform: rest }, version: model.version + 1, updatedAt: new Date().toISOString() });
  };
  return (
    <Section id="voice.words" title="Words and platforms" description="Banned words are never used in posts" model={model} onLock={onLock}>
      <div className="space-y-6">
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <Label>Words to use</Label>
            <ListEditor items={v.vocabulary.use} onChange={(x) => edit({ voice: { vocabulary: { use: x } } })} placeholder="e.g. handcrafted" />
          </div>
          <div>
            <Label>Words to avoid</Label>
            <ListEditor items={v.vocabulary.avoid} onChange={(x) => edit({ voice: { vocabulary: { avoid: x } } })} placeholder="e.g. cheap" />
          </div>
        </div>
        <div>
          <Label>Example lines in your voice</Label>
          <ListEditor items={v.sampleLines} onChange={(x) => edit({ voice: { sampleLines: x } })} placeholder="Write a line the way you would say it" />
        </div>
        <div>
          <Disagreements model={model} edit={edit} onLock={onLock} prefix="voice.tone." />
          <Label>Tone for one platform</Label>
          <div className="flex flex-wrap gap-2 mb-4">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPlatform(p.id)}
                aria-pressed={platform === p.id}
                className={clsx("h-9 px-3 rounded-full border text-sm", platform === p.id ? "border-text ring-1 ring-text font-medium" : "border-border text-text-muted hover:border-text/30")}
              >
                {p.label}
                {v.toneByPlatform?.[p.id] && Object.keys(v.toneByPlatform[p.id]!).length > 0 ? " •" : ""}
              </button>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
            {TONE_KEYS.map((k) => (
              <ScaleSlider
                key={k}
                left={TONE_WORDS[k][0]}
                right={TONE_WORDS[k][1]}
                value={tone[k]}
                onChange={(n) => edit({ voice: { toneByPlatform: { [platform]: { [k]: n } } } })}
                rated={override?.[k] === undefined ? ratedInfo(model, `voice.tone.${k}`) : undefined}
              />
            ))}
          </div>
          <p className="text-xs text-text-muted mt-3">
            {override && Object.keys(override).length > 0 ? (
              <>
                Changed for this platform.{" "}
                <button onClick={reset} className="underline underline-offset-2 hover:text-text">
                  Use the main tone
                </button>
              </>
            ) : (
              "Using your main tone. Move a slider to change it for this platform only."
            )}
          </p>
        </div>
      </div>
    </Section>
  );
}

/** Extra audience detail beyond the chips on the main page. */
export function AudienceMoreSection({ model, edit, onLock }: SectionProps) {
  const a = model.strategy.audience;
  return (
    <Section id="strategy.audience.more" title="More about your audience" model={model} onLock={onLock}>
      <div className="space-y-5">
        <div>
          <Label>Countries</Label>
          <ListEditor items={a.markets.countries} onChange={(x) => edit({ strategy: { audience: { markets: { countries: x } } } })} placeholder="e.g. India" />
        </div>
        <div>
          <Label>City types</Label>
          <ChipGroup
            multi
            options={(Object.keys(CITY_TIER_LABELS) as CityTier[]).map((t) => ({ value: t, label: CITY_TIER_LABELS[t] }))}
            value={a.markets.cityTiers}
            onChange={(x) => edit({ strategy: { audience: { markets: { cityTiers: x } } } })}
          />
        </div>
        <div>
          <Label>Who buys</Label>
          <ChipGroup
            options={[
              { value: "b2c", label: "Individual customers" },
              { value: "b2b", label: "Other businesses" },
            ]}
            value={a.buyerType ? [a.buyerType] : []}
            onChange={(x) => x[0] && edit({ strategy: { audience: { buyerType: x[0] } } })}
          />
        </div>
        <div>
          <Label>Life stages</Label>
          <ListEditor items={a.lifeStages ?? []} onChange={(x) => edit({ strategy: { audience: { lifeStages: x } } })} placeholder="e.g. new parents" />
        </div>
        <div>
          <Label>Interests</Label>
          <ListEditor items={a.interests ?? []} onChange={(x) => edit({ strategy: { audience: { interests: x } } })} placeholder="e.g. trekking" />
        </div>
        <div>
          <Label>Where they spend time</Label>
          <ListEditor items={a.channels ?? []} onChange={(x) => edit({ strategy: { audience: { channels: x } } })} placeholder="e.g. Instagram, WhatsApp" />
        </div>
        <div>
          <Label>What holds them back</Label>
          <ListEditor items={a.objections ?? []} onChange={(x) => edit({ strategy: { audience: { objections: x } } })} placeholder="e.g. price" />
        </div>
        <Text label="Their mindset and values" rows={2} value={a.psychographic} onSave={(x) => edit({ strategy: { audience: { psychographic: x } } })} />
        <Text label="Notes" rows={2} value={a.notes ?? ""} onSave={(x) => edit({ strategy: { audience: { notes: x } } })} />
      </div>
    </Section>
  );
}

/** Products, entry points and vibe words. */
export function ContentMoreSection({ model, edit, onLock }: SectionProps) {
  const c = model.content;
  return (
    <Section id="content.more" title="Products and themes" model={model} onLock={onLock}>
      <div className="space-y-5">
        <div>
          <Label>Products and services</Label>
          <ListEditor items={c.productsServices} onChange={(x) => edit({ content: { productsServices: x } })} placeholder="Add a product" />
        </div>
        <div>
          <Label>Moments people buy in</Label>
          <ListEditor items={c.categoryEntryPoints} onChange={(x) => edit({ content: { categoryEntryPoints: x } })} placeholder="e.g. gifting season" />
        </div>
        <div>
          <Label>Vibe words</Label>
          <ListEditor items={c.vibe} onChange={(x) => edit({ content: { vibe: x } })} placeholder="e.g. warm" />
        </div>
      </div>
    </Section>
  );
}
