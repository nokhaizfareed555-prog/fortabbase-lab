-- Admin panels: private to the main owner (nokhaizfareedawan555@gmail.com), not to every owner.
-- admin_panel_access: who may see the switcher and Setup > Admin panels. The main owner's row has is_main.
-- Only the main owner can add or edit panels, save keys and grant access. People granted access can
-- see the switcher and open the panels; one-click sign-in always uses their own email.

create table if not exists public.admin_panel_access (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  is_main boolean not null default false,
  granted_by text not null default '',
  granted_at timestamptz not null default now()
);
alter table public.admin_panel_access enable row level security;
revoke all on public.admin_panel_access from anon, authenticated;

insert into public.admin_panel_access (profile_id, is_main, granted_by)
select id, true, 'setup' from public.profiles where lower(email) = 'nokhaizfareedawan555@gmail.com'
on conflict (profile_id) do update set is_main = true;

create or replace function public._panels_see() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_panel_access a join profiles p on p.id = a.profile_id where a.profile_id = auth.uid() and p.active) $$;
create or replace function public._panels_main() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_panel_access a join profiles p on p.id = a.profile_id where a.profile_id = auth.uid() and a.is_main and p.active) $$;

-- Now returns {see, manage, panels, people}. people is only filled for the main owner.
drop function if exists public.admin_panels_list();
create or replace function public.admin_panels_list() returns jsonb language sql stable security definer set search_path = public as $$
  select case when not _panels_see() then jsonb_build_object('see', false, 'manage', false, 'panels', '[]'::jsonb, 'people', '[]'::jsonb) else jsonb_build_object(
    'see', true, 'manage', _panels_main(),
    'panels', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'line', p.line, 'mark', p.mark, 'color', p.color, 'logo', p.logo,
      'admin_url', p.admin_url, 'sb_url', case when _panels_main() then p.sb_url else '' end,
      'sign_in_email', case when _panels_main() then p.sign_in_email else '' end, 'sort', p.sort, 'active', p.active,
      'has_key', exists(select 1 from admin_panel_keys k where k.panel_id = p.id)) order by p.sort, p.created_at)
      from admin_panels p where p.active or _panels_main()), '[]'::jsonb),
    'people', case when _panels_main() then coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'email', s.email, 'name', s.name, 'role', s.role,
      'granted', a.profile_id is not null, 'main', coalesce(a.is_main, false)) order by coalesce(a.is_main, false) desc, s.created_at)
      from profiles s left join admin_panel_access a on a.profile_id = s.id where s.active), '[]'::jsonb) else '[]'::jsonb end) end $$;

create or replace function public.admin_panels_grant(p_id uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
declare v_actor text; v_email text;
begin
  if not _panels_main() then raise exception 'Only the main owner can change who sees admin panels'; end if;
  if p_id = auth.uid() then raise exception 'You always keep access'; end if;
  select email into v_email from profiles where id = p_id and active;
  if v_email is null then raise exception 'Staff member not found'; end if;
  select email into v_actor from profiles where id = auth.uid();
  if p_on then insert into admin_panel_access (profile_id, granted_by) values (p_id, v_actor) on conflict (profile_id) do nothing;
  else delete from admin_panel_access where profile_id = p_id and not is_main; end if;
  insert into audit_log (actor_email, action, area, detail) values (v_actor, case when p_on then 'Gave admin panels access' else 'Removed admin panels access' end, 'panels', jsonb_build_object('email', v_email));
end $$;

-- Saving, removing and ordering panels: main owner only.
create or replace function public._is_owner() returns boolean language sql stable security definer set search_path = public as $$ select _panels_main() $$;

revoke all on function public._panels_see(), public._panels_main(), public.admin_panels_list(), public.admin_panels_grant(uuid, boolean) from public, anon;
grant execute on function public._panels_see(), public._panels_main(), public.admin_panels_list(), public.admin_panels_grant(uuid, boolean) to authenticated;
