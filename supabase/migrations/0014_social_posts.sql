-- Real posts scraped from a brand's own social account (Apify). Input to the style guide and
-- voice playbook. Not the posts Brandly generates (those live in `posts`).
create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  platform text not null default 'instagram',
  external_id text not null,
  posted_at timestamptz,
  type text not null default 'image' check (type in ('image', 'carousel', 'video', 'text')),
  caption text not null default '',
  hashtags text[] not null default '{}',
  mentions text[] not null default '{}',
  likes int not null default 0,
  comments int not null default 0,
  views int not null default 0,
  media_urls text[] not null default '{}',
  stored_paths text[] not null default '{}',   -- copies in the `images` bucket
  engagement_score numeric not null default 0,
  is_top boolean not null default false,
  created_at timestamptz not null default now(),
  unique (brand_id, platform, external_id)
);
create index social_posts_brand_idx on public.social_posts(brand_id, is_top desc, engagement_score desc);
create index social_posts_workspace_idx on public.social_posts(workspace_id);

alter table public.social_posts enable row level security;
create policy social_posts_select on public.social_posts for select to authenticated using (public.is_member(workspace_id));
create policy social_posts_insert on public.social_posts for insert to authenticated with check (public.can_edit(workspace_id));
create policy social_posts_update on public.social_posts for update to authenticated
  using (public.can_edit(workspace_id)) with check (public.can_edit(workspace_id));
create policy social_posts_delete on public.social_posts for delete to authenticated using (public.can_edit(workspace_id));
