-- Diario del bebé — schema migration 02
-- Adds "biberón" (bottle) as a trackable event type.
-- Run this in the Supabase SQL editor AFTER schema.sql has already
-- been applied (i.e. toma_events already exists).

alter table toma_events drop constraint toma_events_type_check;
alter table toma_events add constraint toma_events_type_check
  check (type in ('pp', 'ka', 'to', 'ba', 'bi'));
