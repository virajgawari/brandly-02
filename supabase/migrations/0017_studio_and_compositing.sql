-- Studio: cached product cutouts, and provenance metadata on rendered assets.
alter table public.products
  add column if not exists cutout_url text,
  add column if not exists cutout_status text not null default 'pending'
    check (cutout_status in ('pending', 'ready', 'failed'));

alter table public.media_assets
  add column if not exists source_type text not null default 'uploaded'
    check (source_type in ('uploaded', 'synthetic', 'product_composite')),
  add column if not exists c2pa_signed boolean not null default false,
  add column if not exists is_ai_generated boolean not null default false,
  add column if not exists has_synthetic_visual boolean not null default false;

-- Conversational post patches are logged for the learning agent.
alter table public.content_events drop constraint if exists content_events_event_check;
alter table public.content_events add constraint content_events_event_check check (event in (
  'generated', 'regenerated', 'edited', 'copied', 'scheduled', 'rescheduled',
  'published', 'discarded', 'variant_selected', 'image_generated', 'patched'
));
