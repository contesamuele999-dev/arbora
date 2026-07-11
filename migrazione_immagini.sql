-- Allegati immagine alle righe delle viste (Supabase Storage).
-- Esegui una volta sola nel SQL editor di Supabase.

-- 1) Bucket pubblico per le immagini (lettura via URL pubblico, scrittura solo autenticati).
insert into storage.buckets (id, name, public)
values ('vista-immagini', 'vista-immagini', true)
on conflict (id) do nothing;

-- 2) Policy: ognuno gestisce solo le immagini nella propria cartella (prefisso = user id).
--    La lettura è pubblica (bucket public) così le miniature/URL funzionano ovunque.
drop policy if exists "vista_img_insert" on storage.objects;
create policy "vista_img_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vista-immagini'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "vista_img_update" on storage.objects;
create policy "vista_img_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'vista-immagini'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "vista_img_delete" on storage.objects;
create policy "vista_img_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vista-immagini'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
