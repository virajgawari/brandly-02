import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HomeClient from "./HomeClient";

const STEPS = [
  { n: "1", title: "Show us your brand", body: "Paste your website or Instagram, or answer a few questions if you are starting fresh." },
  { n: "2", title: "Check what we found", body: "Colours, fonts, voice and audience in one profile. Change anything that is off." },
  { n: "3", title: "Write, plan, schedule", body: "Draft posts in that voice, see a score before you publish, and put them on a calendar." },
];

const SAMPLE_COLORS = ["#1F3A2E", "#E8DFC8", "#C8553D", "#F5F1E8"];

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
    <div className="min-h-screen bg-bg text-text">
      <header className="max-w-5xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
        <a href="/" aria-label="Brandly home" className="font-semibold tracking-tight">
          Brandly
        </a>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/login" className="text-text-muted hover:text-text">
            Sign in
          </Link>
          <Link href="/signup" className="rounded-lg bg-text text-bg px-3.5 h-9 grid place-items-center hover:opacity-90">
            Get started
          </Link>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-8">
        <section className="grid gap-10 lg:grid-cols-[1.1fr_1fr] items-center py-14 sm:py-24">
          <div>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1]">Social posts that sound like your brand.</h1>
            <p className="text-text-muted mt-5 text-base sm:text-lg leading-relaxed max-w-lg">
              Brandly reads your website or Instagram once, builds a profile of your colours, fonts and voice, then helps you write, plan and schedule posts.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-lg bg-text text-bg px-5 h-11 grid place-items-center text-sm font-medium hover:opacity-90">
                Get started
              </Link>
              <Link href="/login" className="rounded-lg border border-border px-5 h-11 grid place-items-center text-sm hover:border-text/30">
                Sign in
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5" aria-label="Example brand profile">
            <p className="text-xs text-text-muted">Example brand profile</p>
            <p className="font-semibold mt-1">Juniper &amp; Co. Bakery</p>
            <div className="grid grid-cols-4 rounded-lg overflow-hidden border border-border h-12 mt-4">
              {SAMPLE_COLORS.map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-text-muted">Voice</dt>
                <dd>Warm, plain-spoken, a little playful</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Audience</dt>
                <dd>Neighbourhood regulars, 25 to 44</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Fonts</dt>
                <dd>Fraunces for headlines, Inter for text</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="pb-20">
          <h2 className="text-sm font-medium text-text-muted">How it works</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl border border-border bg-card p-5">
                <span className="text-xs text-text-muted tabular-nums">{s.n}</span>
                <p className="font-medium mt-2">{s.title}</p>
                <p className="text-sm text-text-muted mt-1 leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
