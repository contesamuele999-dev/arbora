-- Migrazione: viste fissate in cima alla visione (Pipe), sincronizzate sul cloud.
-- Esegui nello SQL Editor di Supabase (Dashboard -> SQL).
alter table public.viste add column if not exists pinned boolean default false;
