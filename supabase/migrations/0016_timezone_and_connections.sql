-- Horizon 1: workspace timezone, publishing-provider choice, publish retry state.

-- IANA timezone (e.g. Asia/Kolkata). Recurring automations fire at the owner's local time of day.
alter table public.workspaces add column if not exists timezone text not null default 'UTC';

-- How this workspace publishes: managed OAuth broker, its own Postiz key, or an n8n webhook.
alter table public.workspaces add column if not exists oauth_provider text not null default 'postiz_byok'
  check (oauth_provider in ('managed', 'postiz_byok', 'n8n_webhook'));

-- Connected social accounts per workspace (filled by the managed OAuth flow).
create table if not exists public.workspace_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('managed', 'postiz_byok', 'n8n_webhook')),
  platform text not null,
  external_account_id text not null,
  display_name text,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  unique (workspace_id, platform, external_account_id)
);
create index if not exists workspace_connections_ws_idx on public.workspace_connections(workspace_id);
alter table public.workspace_connections enable row level security;

-- OAuth tokens never live in the client-readable table above. They go in this one: RLS on and no policies,
-- so only the service role (server routes, the publish worker) can read or write them.
create table if not exists public.workspace_connection_secrets (
  connection_id uuid primary key references public.workspace_connections(id) on delete cascade,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.workspace_connection_secrets enable row level security;

create policy workspace_connections_select on public.workspace_connections
  for select using (public.is_member(workspace_id));
create policy workspace_connections_insert on public.workspace_connections
  for insert with check (public.can_edit(workspace_id));
create policy workspace_connections_update on public.workspace_connections
  for update using (public.can_edit(workspace_id)) with check (public.can_edit(workspace_id));
create policy workspace_connections_delete on public.workspace_connections
  for delete using (public.can_edit(workspace_id));

-- Publish retries: transient failures (429/5xx) keep the post scheduled and back off.
alter table public.posts add column if not exists publish_attempts int not null default 0;
alter table public.posts add column if not exists next_publish_at timestamptz;
-- The 5-minute publish cron only scans posts that are waiting on a retry, never published history.
create index if not exists posts_retry_due_idx on public.posts(next_publish_at) where status = 'scheduled' and next_publish_at is not null;
