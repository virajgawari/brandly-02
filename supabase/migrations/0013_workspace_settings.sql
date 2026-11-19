-- Account settings: AI watermark on rendered posts and email preferences.
alter table public.workspaces
  add column if not exists ai_watermark boolean not null default false,
  add column if not exists email_prefs jsonb not null default '{"weekly": true, "product": false}'::jsonb;
