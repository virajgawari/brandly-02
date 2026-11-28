# Brandly — AI-Powered Brand Content Platform

A Next.js app that builds a Brand Model for a business, generates on-brand social posts, schedules them and publishes through Postiz. Data lives in Supabase; text AI runs on Groq, Gemini or Claude with automatic fallback.

## Features

- **Brand Intelligence** — crawl a website, Instagram and PDF catalogues to build a Brand Model (strategy, identity, voice, content pillars, layout kit)
- **AI Composer** — full post packages (caption, hashtags, CTA, visual brief, best time) for Instagram, Facebook, LinkedIn and X, with a rotating brief so posts don't repeat
- **Visual Calendar** — month/week views, scheduling, status tracking
- **Automation** — RSS and product-page triggers and recurring schedules, run by a Postgres jobs queue drained by cron

## Tech Stack

- **Framework**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Data and auth**: Supabase (Postgres, RLS, email sign-in). Every API route requires a session
- **AI**: Groq (primary), Gemini (PDFs, screenshots, backup), Anthropic Claude (optional), via `lib/llm.ts`. Models and order are set in `.env.example`
- **Publishing**: Postiz, directly or through the optional n8n workflow (`n8n/README.md`)
- **Tests**: Vitest (`npm test`)

## Setup

```bash
npm install
cp .env.example .env.local     # then fill in the keys
npm run db:migrate             # applies supabase/migrations/*.sql using DATABASE_URL
npm run dev
```

Required in `.env.local`: the Supabase URL, publishable key, secret key and `DATABASE_URL`, plus at least one of `GROQ_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`. `CRON_SECRET` is needed for `/api/cron/*`. The dev server uses port 3000 unless it is taken.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Vitest unit tests (`tests/`) |
| `npm run db:migrate` | Apply new SQL migrations |
| `npm run db:test` | Check the signup trigger and workspace isolation (rolled-back transaction) |
| `npm run eval -- --dry` | Replay the fixed briefs in `evals/briefs/` with no LLM calls |
| `npm run eval -- --limit 2 --delay 20 --tag name` | Real generation, scored and stored in `eval_runs`. Add `--no-db` to skip storing. Mind provider rate limits on free keys |

## Database & sign-in (Supabase)

- Schema lives in `supabase/migrations/*.sql`. Apply with `npm run db:migrate` (uses `DATABASE_URL` from `.env.local`).
- `npm run db:test` checks the signup trigger and that workspaces can't see each other's data (runs in a rolled-back transaction).
- Sign-in: email + password, or an emailed magic link / code. Each new user gets a personal workspace; brands, posts and rules belong to a workspace.
- The browser keeps a cache (`lib/store.ts`); the database is the source of truth. Brands saved in a browser before accounts existed can be imported from the banner shown after sign-in.

**Data collected to improve Brandly** (only workspaces that opt in are ever used for training or evals):

| Table | What it records |
|---|---|
| `llm_calls` | every model call: feature, prompt version, model, tokens, latency, fallbacks, output |
| `brand_versions` | every Brand Model change (append-only, with changed fields) |
| `field_corrections` | a user changing a field the AI filled in (extraction accuracy) |
| `build_sessions` | all directions shown in Build and the one picked |
| `posts.original_content` | the model's exact output, kept unchanged next to the edited `content` |
| `content_events` | generated, regenerated, edited (with edit ratio), scheduled, published, discarded |
| `generation_feedback` | thumbs up/down + reasons |
| `post_metrics` | engagement once publishing is connected |
| `product_events` | onboarding funnel steps |

Analysis views: `v_post_quality`, `v_cost_per_brand`, `v_field_accuracy`. Fill `model_prices` to get costs.

## Project Structure

```
app/
  api/                  # Route handlers: analyse-brand, generate-post, posts, publish, cron, jobs, ...
  composer/ calendar/ automation/ onboarding/ brand/ login/ signup/
components/             # layout, composer, ui
lib/
  brand/                # Brand Model, merge, schemas, build pipeline
  content/              # post brief, prompt, history, generation
  db/                   # session, brands, LLM scope
  jobs/                 # Postgres queue and handlers
  net/safe-fetch.ts     # SSRF guard for user-supplied URLs
  llm.ts, llm-log.ts    # providers, fallback, call logging
  templates.ts          # content templates and platform limits
evals/                  # fixture brands, briefs, scoring
scripts/                # migrate, RLS test, eval runner
supabase/migrations/    # schema
tests/                  # Vitest
n8n/                    # optional backend workflow
```

## PDF Processing

PDF pages are rasterised in the browser with PDF.js (raster and vector layers) and sent to a vision model as JPEGs. Up to 8 pages are analysed per PDF.

## Deployment (Vercel)

1. Push to GitHub and import the repo in Vercel.
2. Add the environment variables from `.env.example`, including `CRON_SECRET`.
3. `vercel.json` schedules `/api/cron/schedule` and `/api/cron/drain` daily and `/api/cron/learn` weekly. The Hobby plan allows nothing more frequent than daily.
4. Call the two frequent routes from an external scheduler, as a `GET` with the header `Authorization: Bearer $CRON_SECRET`. Until you do, scheduled posts are not published and automation rules do not run on their own.

   | Route | Every |
   |---|---|
   | `/api/cron/publish` | 5 minutes |
   | `/api/cron/automations` | 15 minutes |

## Known gaps

- No invite/accept UI yet, so a workspace has a single member.
- `safe-fetch` validates the address before each request but does not pin the IP, so DNS rebinding is not fully closed.
- Social API connections other than Postiz, analytics, and ecommerce integrations are not built.
