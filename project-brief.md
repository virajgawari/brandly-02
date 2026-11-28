# Brandly — Architectural Brief

## 1. Purpose and target users
Brandly is an AI brand-content platform. It builds a structured **Brand Model** for a business (strategy, identity, voice, content pillars, colours, fonts, layout kit) from its website, Instagram and PDF catalogues. It then generates on-brand social posts (caption, hashtags, CTA, visual brief, best time) and images, schedules them and publishes them. The product direction is a Pomelli/Ocoya-style experience with two onboarding doors, low-cost models and no generic "AI-slop" UI.

Target users are small businesses, marketers and agencies who need consistent social content for Instagram, Facebook, LinkedIn and X. Accounts are multi-tenant: each user gets a workspace with roles (editor, invited members). An admin area exists for operators.

## 2. Tech stack and external services
- **App**: Next.js 15 (App Router) with React 19 and TypeScript. Tailwind CSS, Radix UI, framer-motion, zustand (client cache), react-dnd.
- **Validation**: zod schemas. Tests use Vitest. Scripts are run with tsx.
- **Data and auth**: Supabase (Postgres, row-level security, email/password and magic-link sign-in) through `@supabase/ssr`. Migrations are plain SQL applied by a `pg`-based script.
- **LLMs** (via `lib/llm.ts`, with ordered fallback and per-call logging):
  - Groq for fast and creative text (gpt-oss and Qwen models). This is the primary provider, on a free key with a tight quota.
  - Google Gemini for vision, PDFs, screenshots and backup.
  - Anthropic Claude, optional.
- **Image generation**: Muse API (Meta, `muse-image-1.0`), plus server-side compositing and rendering of product scenes and layouts. C2PA content credentials are attached to output.
- **Social data**: Apify, for scraping Instagram and social stats.
- **Publishing**: Postiz (direct), with an optional n8n workflow as backend.
- **Other**: RSS parsing, an SSRF-safe fetch layer, Vercel hosting with cron.

## 3. Core modules and end-to-end data flow
**Modules (`lib/`)**
- `brand/`: the Brand Model, a staged build pipeline (extract, measure, rate, contradictions), colour, fonts, audience, evidence citation, merge and versioning.
- `crawl.ts`, `web.ts`, `social/`: site and Instagram ingestion, plus post triage and learning from top posts.
- `content/`: briefs, prompts, hashtags, history, ideas, campaigns, product catalog hooks, generation loop and the **art-director step**. The art director compiles the brand model, top posts and copy into the image prompt.
- `judge/`: grounding, fit, feed and rules checks on generated copy.
- `render/`: layouts, templates, scenes, layout QA and fix, fonts, Muse, C2PA.
- `catalog/` and `images/`: product sync and product-photo compositing.
- `agent/`: an analytics and learning agent (insights, metrics, config).
- `jobs/`: Postgres-backed job queue and handlers.
- `automation-*`: RSS and product-page triggers and recurring schedules.
- `db/`, `supabase/`: session, workspace scoping (`llmScope`) and clients.

**Flow**
1. **Onboard.** The user supplies a URL, Instagram handle or PDF. The ingest routes (`analyse-brand`, `analyse-pdf`) crawl and analyse it. The staged pipeline fills the Brand Model with cited evidence, flags contradictions and rates completeness. The user reviews and edits it, and edits are recorded as corrections and versions.
2. **Generate.** The composer (`generate-post`, `suggest-ideas`, `campaign`) builds a brief with a rotating angle. A generation loop then checks the draft against brand rules, grounding and fit, and regenerates if it fails. Images come from the art director and Muse, or from compositing a product photo into a scene, and are rendered to a layout (`render-post`, `generate-image`).
3. **Schedule and publish.** Posts are saved, shown on the calendar and queued. A cron job (every 5 minutes) publishes them through Postiz or n8n, and connections and secrets are stored per workspace.
4. **Learn.** Metrics, edits, feedback and top-post stats flow back through the weekly learn cron and the agent to improve later generations.

**Scheduled work (Vercel cron)**: `schedule` daily, `drain` daily (jobs queue), `learn` weekly, `publish` every 5 minutes, `automations` every 15 minutes.

**UI routes**: onboarding, brand, composer, calendar, catalog, automation, data, sprint, assets, settings, admin, auth pages, and legal pages.

## 4. Main data models (Supabase, migrations 0001–0017)
- **Tenancy and auth**: `profiles`, `workspaces`, `workspace_members`, `workspace_invites`, plus `workspace_settings` (including timezone).
- **Brand**: `brands`, `brand_versions` (append-only history), `brand_evidence`, `build_sessions`, `field_corrections`.
- **Content**: `posts` (keeps the model's original output next to the edited text), `post_publications`, `post_metrics`, `social_posts`, `media_assets`, `products`, `automation_rules`.
- **Infrastructure**: `jobs` (queue), `workspace_secrets`, `workspace_connections`, `workspace_connection_secrets`.
- **Telemetry and quality**: `llm_calls`, `model_prices`, `generation_feedback`, `content_events`, `product_events`, `eval_runs`.
- **Agent and admin**: `agent_insights`, `agent_config`, `agent_runs`, `admin_audit`.
- **Views**: `v_post_quality`, `v_cost_per_brand` and `v_field_accuracy`.

All tables are workspace-scoped with RLS. `npm run db:test` checks isolation inside a rolled-back transaction.

## 5. Status, bottlenecks and unfinished work
**Where things stand**
- The branch is `feat/pomelli-parity-phase1`, with about 107 commits. The latest committed work is the art-director step.
- Uncommitted changes touch the schemas, art direction, generation, prompt, grounding and `llm.ts`. A new `lib/content/catalog.ts` is untracked, so product-catalog-aware generation is in progress.
- The core loop is built: brand build, composer, calendar, publishing, automation, the data page, the agent and the eval harness (`evals/`, `npm run eval`).

**Bottlenecks and risks**
- **LLM quota.** The free Groq key limits throughput, so evals must be paced and calls kept low. The multi-stage brand build and the regenerate-on-fail judge loop multiply calls per post.
- **Cron granularity.** The daily and weekly crons fit Vercel's hobby-tier limits. Queue draining is therefore coarse, and the 5-minute publish poll is the only near-real-time path.
- **External dependencies.** Muse image quality and rate limits, Apify scraping reliability and Postiz connectivity are all outside the app's control. PDF rasterisation happens in the browser.
- **Layout fidelity.** Rendered layouts need QA and auto-fix passes, which suggests ongoing quality issues.

**Deferred or unfinished**
- Brand Book, Websites and Google sign-in are intentionally not built yet.
- User-facing feature names must stay distinct from Pomelli's.
- Engagement metrics depend on publishing being connected.
- The in-flight catalog and art-director changes are not yet committed or fully tested.
- Graphify output is stale relative to the uncommitted work and should be refreshed with `graphify update .` after changes.
