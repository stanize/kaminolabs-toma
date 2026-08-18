-- Diario del bebé — schema migration 07
-- Adds ml_amount, used to record the quantity (in ml) for Biberón
-- events. Compulsory for new Biberón entries in the app, but nullable
-- in the DB (other event types never set it).
-- Run this in the Supabase SQL editor AFTER schema.sql has already
-- been applied (i.e. toma_events already exists).

alter table toma_events add column if not exists ml_amount integer;
