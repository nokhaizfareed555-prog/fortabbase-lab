-- Uploads failed because the policy read profiles directly, which has no read policy.
create or replace function public.is_active_staff() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from profiles p where p.id = auth.uid() and p.active) $$;
revoke all on function public.is_active_staff() from public, anon;
grant execute on function public.is_active_staff() to authenticated;
drop policy if exists media_write on storage.objects;
create policy media_write on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_active_staff());
