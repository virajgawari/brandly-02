"use client";
import { useState } from "react";

interface DemoBrand {
  id: string;
  name: string;
  kind: string;
  bg: string;
  ink: string;
  accent: string;
  soft: string;
  heading: string;
  voice: string;
  audience: string;
  fonts: string;
  posts: { a: string; b: string; c: string; handle: string };
  caption: string;
}

const BRANDS: DemoBrand[] = [
  {
    id: "bakery",
    name: "Juniper & Co.",
    kind: "Bakery",
    bg: "#F5F1E8",
    ink: "#1F3A2E",
    accent: "#C8553D",
    soft: "#E8DFC8",
    heading: "'Fraunces', Georgia, serif",
    voice: "Warm, plain-spoken, a little playful",
    audience: "Neighbourhood regulars, 25 to 44",
    fonts: "Fraunces and Geist",
    posts: { a: "Sourdough is out of the oven.", b: "Saturday: 6 loaves left", c: "“Bread is better when someone you know baked it.”", handle: "@junipercobakery" },
    caption: "Saturday loaves are out at 7. Come early, the cinnamon ones go fast.",
  },
  {
    id: "chai",
    name: "Kaveri Chai",
    kind: "Tea cafe",
    bg: "#FFF4DC",
    ink: "#3B1D12",
    accent: "#D98E04",
    soft: "#F3D9A4",
    heading: "'Fraunces', Georgia, serif",
    voice: "Friendly, Hinglish, festive",
    audience: "Students and office crowds, 18 to 35",
    fonts: "Fraunces and Geist",
    posts: { a: "Adrak chai, barish wali.", b: "Diwali box: 20% off", c: "“Ek cutting chai, aur sab theek.”", handle: "@kaverichai" },
    caption: "Barish aur adrak chai, perfect jodi. Aaj 4 baje se, fresh batch.",
  },
  {
    id: "gym",
    name: "Stride Studio",
    kind: "Fitness",
    bg: "#EEF1F4",
    ink: "#0F1B2D",
    accent: "#2563EB",
    soft: "#D5DEEA",
    heading: "'Space Grotesk', system-ui, sans-serif",
    voice: "Direct, encouraging, no jargon",
    audience: "Busy professionals, 28 to 45",
    fonts: "Space Grotesk and Geist",
    posts: { a: "20 minutes. No excuses.", b: "New batch starts Monday", c: "“You do not need more time. You need a plan.”", handle: "@stridestudio" },
    caption: "Short on time? Our 20 minute strength class fits before work. Monday batch is open.",
  },
];

/** The brand is the hero: pick one and the whole preview takes on its colours, fonts and voice. */
export default function BrandDemo() {
  const [id, setId] = useState(BRANDS[0].id);
  const b = BRANDS.find((x) => x.id === id) ?? BRANDS[0];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-pop overflow-hidden" aria-label="Interactive example: three sample brands">
      <div className="flex items-center gap-2 px-4 pt-4 flex-wrap" role="tablist" aria-label="Sample brands">
        <span className="text-xs text-text-muted mr-1">Try a brand</span>
        {BRANDS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={x.id === id}
            onClick={() => setId(x.id)}
            className={`h-8 px-3 rounded-full text-xs border transition-colors ${x.id === id ? "bg-text text-bg border-text" : "border-border text-text-muted hover:text-text hover:border-text/30"}`}
          >
            {x.name}
          </button>
        ))}
      </div>

      <div className="p-4 grid gap-3 grid-cols-[1.25fr_1fr]" style={{ transition: "all .3s" }}>
        {/* Large post */}
        <div className="row-span-2 rounded-xl p-5 flex flex-col justify-between aspect-[4/5] sm:aspect-auto min-h-[240px] transition-colors duration-300" style={{ background: b.bg, color: b.ink }}>
          <span className="self-start text-[10px] font-medium rounded-full px-2.5 py-1 uppercase tracking-wide" style={{ background: b.accent, color: b.bg }}>
            {b.kind}
          </span>
          <p className="text-2xl sm:text-[28px] leading-[1.1] font-semibold" style={{ fontFamily: b.heading }}>
            {b.posts.a}
          </p>
          <p className="text-[11px] opacity-70">{b.posts.handle}</p>
        </div>
        {/* Offer tile */}
        <div className="rounded-xl p-4 relative overflow-hidden aspect-square transition-colors duration-300" style={{ background: b.accent, color: b.bg }}>
          <span className="absolute -right-6 -bottom-6 h-24 w-24 rounded-full" style={{ background: b.soft, opacity: 0.35 }} aria-hidden />
          <p className="text-base leading-tight font-semibold relative" style={{ fontFamily: b.heading }}>
            {b.posts.b}
          </p>
        </div>
        {/* Quote tile */}
        <div className="rounded-xl p-4 aspect-square flex items-end transition-colors duration-300" style={{ background: b.ink, color: b.bg }}>
          <p className="text-[13px] leading-snug" style={{ fontFamily: b.heading }}>
            {b.posts.c}
          </p>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="grid grid-cols-4 rounded-lg overflow-hidden border border-border h-6" aria-label="Brand colours">
          {[b.bg, b.soft, b.accent, b.ink].map((c) => (
            <span key={c} style={{ background: c }} className="transition-colors duration-300" />
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-bg border border-border p-3 text-xs leading-relaxed">
          <p className="text-text-muted">Caption in this brand&rsquo;s voice</p>
          <p className="mt-1">{b.caption}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-text-muted">
            <span>Voice: {b.voice}</span>
            <span>Audience: {b.audience}</span>
            <span>Fonts: {b.fonts}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
