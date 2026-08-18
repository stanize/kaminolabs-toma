-- Diario del bebé — schema migration 06
-- Adds an optional answer field to toma_questions, so you can record
-- what the pediatrician said alongside the question.
-- Run this in the Supabase SQL editor AFTER schema_05.sql.

alter table toma_questions add column if not exists answer text;
