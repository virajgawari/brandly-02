-- Posts remember which catalogue product they were about, and metrics can be typed in by hand
-- until a publisher (Postiz, Ayrshare...) can supply them.
alter table public.posts
  add column product_id uuid references public.products(id) on delete set null;
create index posts_product_idx on public.posts(product_id) where product_id is not null;

alter table public.post_metrics
  add column source text not null default 'api' check (source in ('api', 'manual'));

-- A manual metric needs a publication row to hang off; make one per (post, platform) at most.
create unique index post_publications_post_platform_uniq on public.post_publications(post_id, platform);
