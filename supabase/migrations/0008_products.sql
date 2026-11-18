-- Product catalogue: what a brand sells. Posts, ideas and photoshoots start from these rows.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  description text not null default '',
  price text,                                   -- free text so "from Rs 499" works
  url text,                                     -- product page, used to re-sync images
  category text,
  tags text[] not null default '{}',
  image_paths text[] not null default '{}',     -- paths in the `images` bucket
  source text not null default 'manual' check (source in ('manual', 'url', 'photoshoot', 'brand')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_brand_idx on public.products(brand_id, status, created_at desc);
create index products_workspace_idx on public.products(workspace_id);
create trigger products_updated before update on public.products for each row execute function public.set_updated_at();

alter table public.products enable row level security;
create policy products_select on public.products for select to authenticated using (public.is_member(workspace_id));
create policy products_insert on public.products for insert to authenticated with check (public.can_edit(workspace_id));
create policy products_update on public.products for update to authenticated
  using (public.can_edit(workspace_id)) with check (public.can_edit(workspace_id));
create policy products_delete on public.products for delete to authenticated using (public.can_edit(workspace_id));
