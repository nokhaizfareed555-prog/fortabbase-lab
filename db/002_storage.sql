-- Public image bucket. Any active staff member may upload; anyone can view.
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
create policy media_read on storage.objects for select to anon, authenticated using (bucket_id = 'media');
create policy media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.active));
