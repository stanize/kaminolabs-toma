-- Diario del bebé — schema migration 04
-- Adds duration_seconds, used by the start/stop timer for Toma and
-- Biberón events (time spent feeding, not just a point-in-time log).
-- Run this in the Supabase SQL editor AFTER schema.sql has already
-- been applied (i.e. toma_events already exists).

alter table toma_events add column if not exists duration_seconds integer;
