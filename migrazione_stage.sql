-- Esegui questo nello SQL Editor di Supabase (una volta sola):
-- aggiunge la fase kanban (bacheca Progress) alle viste.
alter table public.viste add column if not exists stage text default 'idee';
