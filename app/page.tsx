import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PlatformIcon } from "@/components/ui/icons";
import BrandDemo from "@/components/landing/BrandDemo";
import Reveal from "@/components/landing/Reveal";
import HomeClient from "./HomeClient";

const CTA = "rounded-lg bg-text text-bg px-5 h-11 inline-grid place-items-center text-sm font-medium hover:opacity-90";
const CTA_GHOST = "rounded-lg border border-border px-5 h-11 inline-grid place-items-center text-sm hover:border-text/30";

/** Small "screen" frame used for the how-it-works and feature illustrations. */
function Frame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-bg p-4 text-xs ${className}`}>{children}</div>;
}

function Step({ n, title, body, children }: { n: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="h-full rounded-2xl border border-border bg-card p-5 flex flex-col">
      <Frame className="h-44 overflow-hidden">{children}</Frame>
      <p className="mt-5 text-xs text-text-muted tabular-nums">Step {n}</p>
      <h3 className="font-medium mt-1">{title}</h3>
      <p className="text-sm text-text-muted mt-1 leading-relaxed">{body}</p>
    </div>
  );
}

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function Page() {
  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims);
  } catch {
    signedIn = false;
  }
  if (signedIn) return <HomeClient />;

  return (
    <div className="min-h-screen bg-bg text-text overflow-x-hidden">
      {/* Fonts the sample brands use; loaded here so the rest of the app is unaffected. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Space+Grotesk:wght@500;700&display=swap" />

      <header className="sticky top-0 z-20 bg-bg/85 backdrop-blur border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <a href="/" aria-label="Brandly home" className="font-semibold tracking-tight">
            Brandly
          </a>
          <nav className="flex items-center gap-5 text-sm">
            <a href="#how" className="hidden sm:block text-text-muted hover:text-text">How it works</a>
            <a href="#features" className="hidden sm:block text-text-muted hover:text-text">What you get</a>
            <Link href="/login" className="text-text-muted hover:text-text">Sign in</Link>
            <Link href="/signup" className="rounded-lg bg-text text-bg px-3.5 h-9 grid place-items-center hover:opacity-90">Get started</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-4 sm:px-8 grid gap-12 lg:grid-cols-[1fr_1.05fr] items-center pt-12 pb-20 sm:pt-20 sm:pb-28">
          <div>
            <p className="text-xs text-text-muted">For small businesses and growing brands</p>
            <h1 className="mt-3 text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
              Your brand, posted every day. <span className="text-text-muted">Without the agency.</span>
            </h1>
            <p className="text-text-muted mt-6 text-base sm:text-lg leading-relaxed max-w-lg">
              Give Brandly your website or Instagram. It learns your colours, fonts and voice, then writes and designs posts that look and sound like you, and plans them on a calendar.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className={CTA}>Get started</Link>
              <a href="#how" className={CTA_GHOST}>See how it works</a>
            </div>
            <p className="mt-4 text-xs text-text-muted">No design skills needed. Starting from scratch? We will help you build the brand first.</p>
          </div>
          <BrandDemo />
        </section>

        {/* Platforms */}
        <section aria-label="Platforms" className="border-y border-border/60">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-text-muted">
            <span className="text-xs">Posts made for</span>
            {[
              ["instagram", "Instagram"],
              ["facebook", "Facebook"],
              ["linkedin", "LinkedIn"],
              ["twitter", "X"],
            ].map(([p, l]) => (
              <span key={p} className="inline-flex items-center gap-2">
                <PlatformIcon platform={p} size={16} /> {l}
              </span>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="max-w-6xl mx-auto px-4 sm:px-8 py-20 sm:py-28 scroll-mt-16">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-xl">From a link to a month of posts in three steps.</h2>
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Reveal>
              <Step n="1" title="Show us your brand" body="Paste your website or Instagram. No site yet? Answer a few questions and we build the look and voice with you.">
                <div className="rounded-lg border border-border bg-card h-9 px-3 flex items-center justify-between">
                  <span className="text-text-muted">junipercobakery.in</span>
                  <span className="rounded bg-text text-bg px-2 py-1 text-[10px]">Read my brand</span>
                </div>
                <div className="mt-3 space-y-2">
                  {["Colours found", "Fonts found", "Voice and audience"].map((l, i) => (
                    <div key={l} className="flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full border border-border grid place-items-center text-[9px]">{i < 2 ? "✓" : ""}</span>
                      <span className={i < 2 ? "text-text" : "text-text-muted"}>{l}</span>
                    </div>
                  ))}
                </div>
              </Step>
            </Reveal>
            <Reveal delay={120}>
              <Step n="2" title="Check what we found" body="One profile with your colours, fonts, voice and audience. Change anything that is off before a single post is written.">
                <div className="grid grid-cols-4 h-7 rounded overflow-hidden border border-border">
                  {["#F5F1E8", "#E8DFC8", "#C8553D", "#1F3A2E"].map((c) => (
                    <span key={c} style={{ background: c }} />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["Warm", "Plain-spoken", "A little playful", "No jargon"].map((c) => (
                    <span key={c} className="rounded-full border border-border bg-card px-2 py-0.5">{c}</span>
                  ))}
                </div>
                <p className="mt-3 text-text-muted">Fonts: Fraunces, Geist</p>
              </Step>
            </Reveal>
            <Reveal delay={240}>
              <Step n="3" title="Write, plan, schedule" body="Draft posts in that voice, see a score before you publish, and drop them on the calendar.">
                <div className="flex gap-3">
                  <div className="h-24 w-24 shrink-0 rounded-lg p-2 flex items-end text-[11px] font-semibold leading-tight" style={{ background: "#C8553D", color: "#F5F1E8", fontFamily: "'Fraunces', Georgia, serif" }}>
                    Saturday loaves are out
                  </div>
                  <div className="min-w-0">
                    <p className="text-text-muted">Sat, 7:00 am</p>
                    <p className="mt-1 leading-snug">Come early, the cinnamon ones go fast.</p>
                    <span className="mt-2 inline-block rounded-full bg-success/15 text-success px-2 py-0.5">Score 92</span>
                  </div>
                </div>
              </Step>
            </Reveal>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="bg-card border-y border-border/60 scroll-mt-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-20 sm:py-28">
            <Reveal>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-2xl">Made to be good enough to post, and to get better the more you use it.</h2>
            </Reveal>
            <div className="mt-10 grid gap-5 md:grid-cols-6">
              {/* Scorecard */}
              <Reveal className="md:col-span-3">
                <div className="h-full rounded-2xl border border-border bg-bg p-6">
                  <p className="text-xs text-text-muted">Brand check</p>
                  <h3 className="mt-1 text-xl font-medium">A score before you publish</h3>
                  <p className="mt-2 text-sm text-text-muted leading-relaxed">Every draft is checked against your own rules and a brand-fit review. If it drifts, it is revised once and you see why.</p>
                  <div className="mt-5 rounded-xl border border-border bg-card p-4 text-xs">
                    <div className="flex items-end justify-between">
                      <span className="text-text-muted">Example post</span>
                      <span className="text-3xl font-semibold tabular-nums leading-none">92</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {[
                        ["Sounds like your brand", true],
                        ["Avoids words you ban", true],
                        ["Hook in the first line", true],
                        ["Caption length for Instagram", true],
                        ["Call to action is clear", false],
                      ].map(([l, ok]) => (
                        <div key={String(l)} className="flex items-center gap-2">
                          <span className={`h-4 w-4 rounded-full grid place-items-center text-[9px] ${ok ? "bg-success/15 text-success" : "bg-warn/15 text-warn"}`}>{ok ? "✓" : "!"}</span>
                          <span>{String(l)}</span>
                          {!ok && <span className="ml-auto text-text-muted">Suggestion ready</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>

              {/* Learning */}
              <Reveal className="md:col-span-3" delay={120}>
                <div className="h-full rounded-2xl border border-border bg-bg p-6">
                  <p className="text-xs text-text-muted">Learns what works</p>
                  <h3 className="mt-1 text-xl font-medium">It notices what your audience likes</h3>
                  <p className="mt-2 text-sm text-text-muted leading-relaxed">Brandly looks at what you keep, edit and how posts perform, then suggests changes. You accept or dismiss each one.</p>
                  <div className="mt-5 rounded-xl border border-border bg-card p-4 text-xs">
                    <p className="font-medium text-sm">Carousels get about 5x the engagement of quote posts.</p>
                    <p className="text-text-muted mt-1">Example insight</p>
                    <div className="mt-3 space-y-2" aria-label="Engagement by format">
                      {[
                        ["Carousel", 85, "8.5%"],
                        ["Single image", 40, "4.0%"],
                        ["Quote", 15, "1.5%"],
                      ].map(([l, w, v]) => (
                        <div key={String(l)} className="flex items-center gap-2">
                          <span className="w-20 text-text-muted">{l}</span>
                          <span className="h-2.5 rounded-full bg-text" style={{ width: `${w}%`, maxWidth: "60%" }} />
                          <span className="tabular-nums">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <span className="rounded-md bg-text text-bg px-2.5 py-1">Use this</span>
                      <span className="rounded-md border border-border px-2.5 py-1">Dismiss</span>
                    </div>
                  </div>
                </div>
              </Reveal>

              {/* Catalogue */}
              <Reveal className="md:col-span-2">
                <div className="h-full rounded-2xl border border-border bg-bg p-6">
                  <p className="text-xs text-text-muted">Product catalogue</p>
                  <h3 className="mt-1 text-xl font-medium">Turn what you sell into posts</h3>
                  <div className="mt-5 grid grid-cols-3 gap-2" aria-hidden>
                    {[
                      ["#E8DFC8", "#C8553D"],
                      ["#C8553D", "#F5F1E8"],
                      ["#1F3A2E", "#E8DFC8"],
                    ].map(([bg, fg], i) => (
                      <div key={i} className="aspect-square rounded-lg grid place-items-center" style={{ background: bg }}>
                        <span className="h-1/2 w-1/2 rounded-full" style={{ background: fg }} />
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-sm text-text-muted leading-relaxed">Add products once. Pick one and get a post, or a carousel of several.</p>
                </div>
              </Reveal>

              {/* Calendar */}
              <Reveal className="md:col-span-4" delay={120}>
                <div className="h-full rounded-2xl border border-border bg-bg p-6">
                  <p className="text-xs text-text-muted">Calendar</p>
                  <h3 className="mt-1 text-xl font-medium">Plan the week, drag to change it</h3>
                  <div className="mt-5 grid grid-cols-7 gap-1.5 text-[10px] text-text-muted" aria-hidden>
                    {WEEK.map((d) => (
                      <span key={d} className="text-center">{d}</span>
                    ))}
                    {[
                      ["", ""],
                      ["Tip", "#E8DFC8"],
                      ["", ""],
                      ["Offer", "#C8553D"],
                      ["", ""],
                      ["Menu", "#1F3A2E"],
                      ["Quote", "#E8DFC8"],
                    ].map(([l, c], i) => (
                      <div key={i} className="h-16 rounded-md border border-border bg-card p-1">
                        {l && (
                          <div className="h-full rounded grid place-items-center text-[10px] font-medium" style={{ background: c, color: c === "#E8DFC8" ? "#1F3A2E" : "#F5F1E8" }}>
                            {l}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-sm text-text-muted leading-relaxed">Festivals and sale days are easy to plan around. Move a post to another day and it keeps its time.</p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Two doors */}
        <section className="max-w-6xl mx-auto px-4 sm:px-8 py-20 sm:py-28">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-xl">Whether you have a brand or not.</h2>
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-2xl border border-border bg-card p-7">
                <p className="text-xs text-text-muted">I already have a brand</p>
                <h3 className="mt-2 text-xl font-medium">Bring your website or Instagram</h3>
                <p className="mt-2 text-sm text-text-muted leading-relaxed">We read it, pull out your colours, fonts and voice, and show you what we found. Fix anything, then start posting.</p>
                <Link href="/signup" className="mt-6 inline-block text-sm font-medium underline underline-offset-4 hover:opacity-80">Start with my website</Link>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="h-full rounded-2xl border border-border bg-card p-7">
                <p className="text-xs text-text-muted">I am starting out</p>
                <h3 className="mt-2 text-xl font-medium">Build one with a few questions</h3>
                <p className="mt-2 text-sm text-text-muted leading-relaxed">Tell us what you sell and who it is for. We help you pick a palette, a feel and a voice you can grow with.</p>
                <Link href="/signup" className="mt-6 inline-block text-sm font-medium underline underline-offset-4 hover:opacity-80">Build my brand</Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Final CTA */}
        <section className="max-w-6xl mx-auto px-4 sm:px-8 pb-20 sm:pb-28">
          <Reveal>
            <div className="rounded-3xl bg-text text-bg px-6 py-14 sm:px-14 sm:py-20 text-center">
              <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight max-w-2xl mx-auto">See your own brand in a post in a few minutes.</h2>
              <p className="mt-4 opacity-70 max-w-md mx-auto">Paste your website and look at the first draft before you decide anything.</p>
              <Link href="/signup" className="mt-8 inline-grid place-items-center h-12 px-7 rounded-lg bg-bg text-text text-sm font-medium hover:opacity-90">
                Get started
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between text-xs text-text-muted">
          <span>Brandly</span>
          <span className="flex gap-5">
            <Link href="/login" className="hover:text-text">Sign in</Link>
            <Link href="/signup" className="hover:text-text">Get started</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
