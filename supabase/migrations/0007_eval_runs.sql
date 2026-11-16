-- Eval harness: replay fixed briefs through generation and keep outputs + scores per prompt version.
-- Written by scripts/eval.ts over the direct database connection. No client policies:
-- RLS is on, so the anon/authenticated roles cannot read or write it.
create table public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,                 -- one per `npm run eval` invocation
  tag text,                             -- free label, e.g. "baseline" or a branch name
  git_sha text,
  prompt_version text not null,         -- e.g. generate-post@2
  brief_id text not null,               -- evals/briefs/<id>.json
  brand_key text not null,              -- evals/fixtures.ts brand key
  provider text,
  model text,
  output jsonb,                         -- the validated post, null when generation failed
  scores jsonb not null default '{}'::jsonb,
  passed boolean not null default false,
  error text,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index eval_runs_run_idx on public.eval_runs(run_id);
create index eval_runs_version_idx on public.eval_runs(prompt_version, created_at desc);
alter table public.eval_runs enable row level security;
