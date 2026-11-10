-- Apply an admin arrangement to everyone, with owner approval, and per-person notifications.
-- Owners and admins arrange. "Apply for everyone" from an admin waits in Notifications until an owner approves;
-- from an owner it applies at once. Approval stores the layout as shared view "all" (private_settings admin_views),
-- sets everyone's view to it and keeps each person's own arrangement (admin_prefs.mine) so they can switch back.

create table if not exists public.admin_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null default '',
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','declined','cancelled')),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_email text not null default '',
  decided_email text not null default '',
  decided_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  link text not null default '',
  request_id uuid references public.admin_requests(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_notes_profile on public.admin_notes(profile_id, created_at desc);
alter table public.admin_requests enable row level security;
alter table public.admin_notes enable row level security;
revoke all on public.admin_requests from anon, authenticated;
revoke all on public.admin_notes from anon, authenticated;

-- _me() already exists (profiles row of the signed-in, active person).
create or replace function public._is_arranger() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner','admin') from profiles where id = auth.uid() and active), false) $$;

-- Only owners and admins may save their own arrangement; everyone may still choose a view.
create or replace function public.admin_ui_save_mine(p jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid() and active) then raise exception 'Not allowed'; end if;
  if jsonb_typeof(p) <> 'object' or length(p::text) > 30000 then raise exception 'Arrangement is too large'; end if;
  if p ? 'mine' and (p->'mine') is distinct from (select admin_prefs->'mine' from profiles where id = auth.uid()) and not _is_arranger() then
    raise exception 'Only owners and admins can rearrange the admin panel'; end if;
  update profiles set admin_prefs = (admin_prefs - 'view' - 'mine') || jsonb_strip_nulls(jsonb_build_object('view', p->'view', 'mine', p->'mine')) where id = auth.uid();
end $$;

create or replace function public._apply_view_all(p_layout jsonb, p_name text, p_actor text) returns int language plpgsql security definer set search_path = public as $$
declare v jsonb; n int := 0; r record;
begin
  begin select value::jsonb into v from private_settings where key = 'admin_views'; exception when others then v := null; end;
  v := coalesce(v, '{}'::jsonb) || jsonb_build_object('all', p_layout || jsonb_build_object('name', p_name, 'by', p_actor, 'at', now()));
  insert into private_settings(key, value) values ('admin_views', v::text) on conflict (key) do update set value = excluded.value;
  for r in select id, admin_prefs from profiles where active loop
    update profiles set admin_prefs = admin_prefs || jsonb_build_object('view', 'all', 'assigned_by', p_actor,
      'prev_view', coalesce(r.admin_prefs->>'view', '')) where id = r.id;
    insert into admin_notes (profile_id, title, body, link) values (r.id, 'New admin layout for everyone: ' || p_name,
      case when r.admin_prefs ? 'mine' then 'Your own arrangement is kept. Switch back any time from the view menu at the top (My own arrangement).'
        else 'You can still switch views from the view menu at the top.' end, 'arrange');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Ask to apply a layout for everyone. Owners apply at once; admins wait for an owner.
create or replace function public.admin_view_request_all(p_layout jsonb, p_name text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c profiles := _me(); v_id uuid; v_name text := left(coalesce(nullif(trim(p_name), ''), 'Clinic view'), 40); n int;
begin
  if c.id is null or c.role not in ('owner','admin') then raise exception 'Only owners and admins can do this'; end if;
  if jsonb_typeof(p_layout) <> 'object' or length(p_layout::text) > 30000 then raise exception 'Arrangement is too large'; end if;
  insert into admin_requests (kind, title, payload, requested_by, requested_email, status)
  values ('view_all', 'Apply "' || v_name || '" as everyone''s admin layout', jsonb_build_object('layout', p_layout, 'name', v_name), c.id, c.email,
    case when c.role = 'owner' then 'approved' else 'pending' end) returning id into v_id;
  if c.role = 'owner' then
    n := _apply_view_all(p_layout, v_name, c.email);
    update admin_requests set decided_email = c.email, decided_at = now() where id = v_id;
    perform _log('Applied admin layout for everyone', 'arrange', jsonb_build_object('name', v_name, 'people', n));
    return jsonb_build_object('status', 'approved', 'people', n);
  end if;
  insert into admin_notes (profile_id, title, body, link, request_id)
  select id, 'Approval needed: admin layout for everyone', c.email || ' wants "' || v_name || '" to become everyone''s admin layout.', 'notifications', v_id
  from profiles where active and role = 'owner';
  perform _log('Asked to apply admin layout for everyone', 'arrange', jsonb_build_object('name', v_name));
  return jsonb_build_object('status', 'pending');
end $$;

create or replace function public.admin_request_decide(p_id uuid, p_approve boolean, p_note text default '') returns jsonb language plpgsql security definer set search_path = public as $$
declare c profiles := _me(); q admin_requests; n int := 0;
begin
  if c.id is null or c.role <> 'owner' then raise exception 'Only an owner can approve this'; end if;
  select * into q from admin_requests where id = p_id for update;
  if q.id is null then raise exception 'Request not found'; end if;
  if q.status <> 'pending' then raise exception 'Already %', q.status; end if;
  if p_approve and q.kind = 'view_all' then n := _apply_view_all(q.payload->'layout', q.payload->>'name', c.email); end if;
  update admin_requests set status = case when p_approve then 'approved' else 'declined' end, decided_email = c.email, decided_at = now(), note = left(coalesce(p_note, ''), 300) where id = p_id;
  update admin_notes set read_at = coalesce(read_at, now()) where request_id = p_id;
  if q.requested_by is not null then
    insert into admin_notes (profile_id, title, body, link) values (q.requested_by,
      case when p_approve then 'Approved: ' else 'Declined: ' end || q.title, 'By ' || c.email || coalesce(nullif(': ' || p_note, ': '), ''), 'notifications');
  end if;
  perform _log(case when p_approve then 'Approved request' else 'Declined request' end, 'arrange', jsonb_build_object('title', q.title, 'people', n));
  return jsonb_build_object('status', case when p_approve then 'approved' else 'declined' end, 'people', n);
end $$;

-- What the bell and the Notifications page show for the signed-in person.
create or replace function public.admin_notes_get() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c profiles := _me();
begin
  if c.id is null then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'unread', (select count(*) from admin_notes where profile_id = c.id and read_at is null),
    'notes', coalesce((select jsonb_agg(x) from (select id, title, body, link, request_id, read_at, created_at from admin_notes where profile_id = c.id order by created_at desc limit 60) x), '[]'),
    'can_decide', c.role = 'owner',
    'requests', coalesce((select jsonb_agg(x) from (select id, kind, title, status, requested_email, decided_email, decided_at, note, created_at,
        case when kind = 'view_all' then jsonb_build_object('name', payload->>'name', 'groups', (select coalesce(jsonb_agg(g->>'name'), '[]') from jsonb_array_elements(payload->'layout'->'groups') g)) end as summary
      from admin_requests where (c.role = 'owner' or requested_by = c.id) order by (status = 'pending') desc, created_at desc limit 40) x), '[]'));
end $$;

create or replace function public.admin_notes_read(p_ids uuid[] default null) returns void language plpgsql security definer set search_path = public as $$
begin
  update admin_notes set read_at = now() where profile_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
end $$;

create or replace function public.admin_request_cancel(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update admin_requests set status = 'cancelled', decided_at = now() where id = p_id and status = 'pending' and requested_by = auth.uid();
  if not found then raise exception 'Nothing to cancel'; end if;
  update admin_notes set read_at = coalesce(read_at, now()) where request_id = p_id;
end $$;

revoke all on function public._is_arranger(), public._apply_view_all(jsonb, text, text), public.admin_view_request_all(jsonb, text),
  public.admin_request_decide(uuid, boolean, text), public.admin_notes_get(), public.admin_notes_read(uuid[]), public.admin_request_cancel(uuid), public.admin_ui_save_mine(jsonb) from public, anon;
grant execute on function public._is_arranger(), public.admin_view_request_all(jsonb, text), public.admin_request_decide(uuid, boolean, text),
  public.admin_notes_get(), public.admin_notes_read(uuid[]), public.admin_request_cancel(uuid), public.admin_ui_save_mine(jsonb) to authenticated;

-- Shared views: managers may change desk, owner and lab, but the everyone layout ("all") only changes through approval.
create or replace function public.admin_ui_save_views(v jsonb) returns void language plpgsql security definer set search_path = public as $$
declare old jsonb;
begin
  if not _is_mgr() then raise exception 'Only managers can change the shared views'; end if;
  begin select value::jsonb into old from private_settings where key = 'admin_views'; exception when others then old := null; end;
  v := coalesce(v, '{}'::jsonb) - 'all';
  if old ? 'all' then v := v || jsonb_build_object('all', old->'all'); end if;
  if v = '{}'::jsonb then delete from private_settings where key = 'admin_views';
  else
    if jsonb_typeof(v) <> 'object' or length(v::text) > 60000 then raise exception 'Views are too large'; end if;
    insert into private_settings(key, value) values ('admin_views', v::text) on conflict (key) do update set value = excluded.value;
  end if;
  perform _log('Changed admin views', 'arrange', jsonb_build_object('views', (select coalesce(jsonb_agg(k), '[]') from jsonb_object_keys(coalesce(v,'{}')) k)));
end $$;
