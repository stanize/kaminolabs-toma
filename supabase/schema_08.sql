-- Diario del bebé — schema migration 08
-- Adds weight (peso) tracking, separate from toma_events since it's a
-- measurement over time rather than a daily activity log.
-- Run this in the Supabase SQL editor.

create table if not exists toma_weights (
  id uuid primary key default gen_random_uuid(),
  weighed_at date not null,
  weight_kg numeric(5,2) not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table toma_weights enable row level security;

-- Permissive policies, matching toma_events (private family tool, not
-- multi-tenant yet). Tighten with auth.uid() checks if you add login later.
create policy "toma_weights public read"   on toma_weights for select using (true);
create policy "toma_weights public insert" on toma_weights for insert with check (true);
create policy "toma_weights public update" on toma_weights for update using (true);
create policy "toma_weights public delete" on toma_weights for delete using (true);
