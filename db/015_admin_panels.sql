-- Admin panels: the switcher at the top of the admin (like sub-account switching in GoHighLevel).
-- Owners only. Each panel is another website's admin. If the owner saves that project's
-- Supabase service key, the Edge Function panel-pass signs the owner in there with one click
-- (magic link for the same email). Keys live in admin_panel_keys, which no browser can read.

create table if not exists public.admin_panels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  line text not null default '',
  mark text not null default '',
  color text not null default '#14396f',
  logo text not null default '',
  admin_url text not null,
  sb_url text not null default '',
  sign_in_email text not null default '',
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.admin_panel_keys (
  panel_id uuid primary key references public.admin_panels(id) on delete cascade,
  service_key text not null,
  updated_at timestamptz not null default now()
);
alter table public.admin_panels enable row level security;
alter table public.admin_panel_keys enable row level security;
revoke all on public.admin_panels from anon, authenticated;
revoke all on public.admin_panel_keys from anon, authenticated;

create or replace function public._is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'owner' from profiles where id = auth.uid() and active), false) $$;

create or replace function public.admin_panels_list() returns jsonb language sql stable security definer set search_path = public as $$
  select case when not _is_owner() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'line', p.line, 'mark', p.mark, 'color', p.color, 'logo', p.logo,
      'admin_url', p.admin_url, 'sb_url', p.sb_url, 'sign_in_email', p.sign_in_email, 'sort', p.sort, 'active', p.active,
      'has_key', exists(select 1 from admin_panel_keys k where k.panel_id = p.id)) order by p.sort, p.created_at)
    from admin_panels p), '[]'::jsonb) end $$;

create or replace function public.admin_panel_save(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_url text; v_sb text; v_actor text;
begin
  if not _is_owner() then raise exception 'Only an owner can change admin panels'; end if;
  v_url := trim(coalesce(p->>'admin_url', ''));
  v_sb := rtrim(trim(coalesce(p->>'sb_url', '')), '/');
  if trim(coalesce(p->>'name', '')) = '' then raise exception 'Give the panel a name'; end if;
  if v_url !~ '^https://[^/\s]+' then raise exception 'The admin address must start with https://'; end if;
  if v_sb <> '' and v_sb !~ '^https://[a-z0-9-]+\.supabase\.co$' then raise exception 'The Supabase address looks like https://abcd.supabase.co'; end if;
  if nullif(p->>'id', '') is null then
    insert into admin_panels (name, line, mark, color, logo, admin_url, sb_url, sign_in_email, sort, active)
    values (trim(p->>'name'), coalesce(p->>'line', ''), left(coalesce(p->>'mark', ''), 2), coalesce(nullif(p->>'color', ''), '#14396f'),
      coalesce(p->>'logo', ''), v_url, v_sb, lower(trim(coalesce(p->>'sign_in_email', ''))),
      coalesce((p->>'sort')::int, (select coalesce(max(sort), 0) + 1 from admin_panels)), coalesce((p->>'active')::boolean, true))
    returning id into v_id;
  else
    v_id := (p->>'id')::uuid;
    update admin_panels set name = trim(p->>'name'), line = coalesce(p->>'line', ''), mark = left(coalesce(p->>'mark', ''), 2),
      color = coalesce(nullif(p->>'color', ''), '#14396f'), logo = coalesce(p->>'logo', ''), admin_url = v_url, sb_url = v_sb,
      sign_in_email = lower(trim(coalesce(p->>'sign_in_email', ''))), sort = coalesce((p->>'sort')::int, sort),
      active = coalesce((p->>'active')::boolean, active), updated_at = now() where id = v_id;
    if not found then raise exception 'Panel not found'; end if;
  end if;
  if p ? 'service_key' then
    if coalesce(p->>'service_key', '') = '' then delete from admin_panel_keys where panel_id = v_id;
    else insert into admin_panel_keys (panel_id, service_key) values (v_id, trim(p->>'service_key'))
      on conflict (panel_id) do update set service_key = excluded.service_key, updated_at = now();
    end if;
  end if;
  select email into v_actor from profiles where id = auth.uid();
  insert into audit_log (actor_email, action, area, detail) values (v_actor, 'Saved admin panel', 'panels',
    jsonb_build_object('name', p->>'name', 'key_changed', p ? 'service_key'));
  return v_id;
end $$;

create or replace function public.admin_panel_delete(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_actor text;
begin
  if not _is_owner() then raise exception 'Only an owner can change admin panels'; end if;
  delete from admin_panels where id = p_id returning name into v_name;
  select email into v_actor from profiles where id = auth.uid();
  insert into audit_log (actor_email, action, area, detail) values (v_actor, 'Removed admin panel', 'panels', jsonb_build_object('name', v_name));
end $$;

create or replace function public.admin_panels_order(p_ids uuid[]) returns void language plpgsql security definer set search_path = public as $$
begin
  if not _is_owner() then raise exception 'Only an owner can change admin panels'; end if;
  update admin_panels a set sort = x.n from unnest(p_ids) with ordinality as x(id, n) where a.id = x.id;
end $$;

revoke all on function public._is_owner() from public, anon;
revoke all on function public.admin_panels_list() from public, anon;
revoke all on function public.admin_panel_save(jsonb) from public, anon;
revoke all on function public.admin_panel_delete(uuid) from public, anon;
revoke all on function public.admin_panels_order(uuid[]) from public, anon;
grant execute on function public._is_owner(), public.admin_panels_list(), public.admin_panel_save(jsonb),
  public.admin_panel_delete(uuid), public.admin_panels_order(uuid[]) to authenticated;

insert into public.admin_panels (name, line, mark, color, admin_url, sb_url, sort)
select * from (values
  ('Divaar.pk', 'divaar.pk admin', 'D', '#4f46e5', 'https://www.divaar.pk/admin', 'https://anhkpwimjupewgahyawc.supabase.co', 1),
  ('Minzu Crafts', 'minzucrafts.com admin', 'M', '#b4532a', 'https://minzucrafts.com/admin', 'https://mygwidnbepwcbxnrjvzs.supabase.co', 2)
) v(name, line, mark, color, admin_url, sb_url, sort)
where not exists (select 1 from public.admin_panels);
