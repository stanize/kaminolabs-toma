-- Diario del bebé — schema migration 05
-- Adds a checklist of questions to ask at the next pediatrician visit.
-- Run this in the Supabase SQL editor.

create table if not exists toma_questions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  is_checked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table toma_questions enable row level security;

-- Permissive policies, matching toma_events (private family tool, not
-- multi-tenant yet). Tighten with auth.uid() checks if you add login later.
create policy "toma_questions public read"   on toma_questions for select using (true);
create policy "toma_questions public insert" on toma_questions for insert with check (true);
create policy "toma_questions public update" on toma_questions for update using (true);
create policy "toma_questions public delete" on toma_questions for delete using (true);
