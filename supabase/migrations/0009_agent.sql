-- Self-learning agent. Signals are derived from posts, content_events, generation_feedback and
-- post_metrics, so only the findings, their settings and each run are stored.

-- One finding per (brand, key). `key` = dimension:value:metric:direction, so a re-run updates stats
-- in place and never resets a user's accept / dismiss.
create table public.agent_insights (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  key text not null,
  dimension text not null,                      -- format | hook | layout | pillar | template | product
  value text not null,
  metric text not null,                         -- kept | edits | engagement
  direction text not null check (direction in ('more', 'less')),
  statement text not null,                      -- shown to the user and injected into prompts when accepted
  stats jsonb not null default '{}'::jsonb,     -- n, baselineN, rate, baseline, lift
  evidence_post_ids uuid[] not null default '{}',
  confidence real not null default 0,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'dismissed')),
  run_id uuid,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, key)
);
create index agent_insights_brand_idx on public.agent_insights(brand_id, status);
create trigger agent_insights_updated before update on public.agent_insights for each row execute function public.set_updated_at();

-- Learning settings, one row per workspace (admin console edits these).
create table public.agent_config (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  enabled boolean not null default true,
  window_days int not null default 90 check (window_days between 7 and 365),
  min_sample int not null default 4 check (min_sample between 2 and 100),
  min_lift real not null default 0.3 check (min_lift between 0.05 and 3),
  engagement_weight real not null default 0.5 check (engagement_weight between 0 and 1),
  auto_apply boolean not null default false,
  use_llm boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Each learning pass: what it looked at and what it cost.
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  trigger text not null default 'manual' check (trigger in ('manual', 'cron')),
  posts_seen int not null default 0,
  with_metrics int not null default 0,
  findings int not null default 0,
  llm_call_id uuid references public.llm_calls(id) on delete set null,
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index agent_runs_brand_idx on public.agent_runs(brand_id, created_at desc);

alter table public.agent_insights enable row level security;
alter table public.agent_config enable row level security;
alter table public.agent_runs enable row level security;

create policy agent_insights_select on public.agent_insights for select to authenticated using (public.is_member(workspace_id));
create policy agent_insights_insert on public.agent_insights for insert to authenticated with check (public.can_edit(workspace_id));
create policy agent_insights_update on public.agent_insights for update to authenticated
  using (public.can_edit(workspace_id)) with check (public.can_edit(workspace_id));
create policy agent_insights_delete on public.agent_insights for delete to authenticated using (public.can_edit(workspace_id));

create policy agent_config_select on public.agent_config for select to authenticated using (public.is_member(workspace_id));
create policy agent_config_insert on public.agent_config for insert to authenticated
  with check (public.has_role(workspace_id, array['owner', 'admin']));
create policy agent_config_update on public.agent_config for update to authenticated
  using (public.has_role(workspace_id, array['owner', 'admin'])) with check (public.has_role(workspace_id, array['owner', 'admin']));

create policy agent_runs_select on public.agent_runs for select to authenticated using (public.is_member(workspace_id));
create policy agent_runs_insert on public.agent_runs for insert to authenticated with check (public.can_edit(workspace_id));
