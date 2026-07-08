-- Esegui questo nello SQL Editor di Supabase (una volta sola):
-- aggiunge il CESTINO delle righe eliminate (recuperabili 7 giorni) alle viste.
alter table public.viste add column if not exists cestino jsonb default '[]'::jsonb;
