-- Diario del bebé — Supabase schema
-- Run this once in the Supabase SQL editor for your project.

create table if not exists toma_events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('pp', 'ka', 'to', 'ba')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists toma_events_occurred_at_idx
  on toma_events (occurred_at desc);

alter table toma_events enable row level security;

-- Permissive policies: fine for a private family tool where the anon key
-- itself isn't shared publicly. Tighten with auth.uid() checks if you add
-- login later (e.g. a toma_profiles table + user_id column).
create policy "toma_events public read"   on toma_events for select using (true);
create policy "toma_events public insert" on toma_events for insert with check (true);
create policy "toma_events public update" on toma_events for update using (true);
create policy "toma_events public delete" on toma_events for delete using (true);

-- Optional: table for baby profile info (name, birth date) if you want
-- the app to remember it server-side instead of per-device.
create table if not exists toma_profile (
  id uuid primary key default gen_random_uuid(),
  baby_name text,
  birth_date date,
  updated_at timestamptz not null default now()
);

alter table toma_profile enable row level security;
create policy "toma_profile public read"   on toma_profile for select using (true);
create policy "toma_profile public upsert" on toma_profile for insert with check (true);
create policy "toma_profile public update" on toma_profile for update using (true);
