-- Diario del bebé — schema migration 03
-- Adds an optional free-text notes field to each event.
-- Run this in the Supabase SQL editor AFTER schema.sql has already
-- been applied (i.e. toma_events already exists).

alter table toma_events add column if not exists notes text;
