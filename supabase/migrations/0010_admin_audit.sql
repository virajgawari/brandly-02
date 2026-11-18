-- Who changed the learning agent's settings or insights, and what changed.
create table public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,                         -- config.update | insight.accept | insight.dismiss | insight.delete | learn.run
  target text,                                  -- insight id, brand id, ...
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_ws_idx on public.admin_audit(workspace_id, created_at desc);

alter table public.admin_audit enable row level security;
create policy admin_audit_select on public.admin_audit for select to authenticated
  using (public.has_role(workspace_id, array['owner', 'admin']));
create policy admin_audit_insert on public.admin_audit for insert to authenticated
  with check (public.has_role(workspace_id, array['owner', 'admin']) and user_id = (select auth.uid()));
