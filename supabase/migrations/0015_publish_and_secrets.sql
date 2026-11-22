-- Publishing runs on the server clock: a cron job picks due posts and claims each one
-- (publish_claimed_at) so two runs never post the same thing twice.
alter table public.posts add column if not exists publish_claimed_at timestamptz;
create index if not exists posts_due_idx on public.posts(scheduled_at) where status = 'scheduled';

-- A platform is published at most once per post, so a retry can't re-post it.
create unique index if not exists post_publications_once_idx
  on public.post_publications(post_id, platform) where status = 'published';

-- Per-workspace secrets (Postiz API key). RLS on, no policies: only the service role can read or write.
create table if not exists public.workspace_secrets (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  postiz_api_key text,
  updated_at timestamptz not null default now()
);
alter table public.workspace_secrets enable row level security;
