-- Admin views, rearranging and dashboard (migration admin_views).
-- profiles.admin_prefs: each staff member's own choice: {view, mine:{layout}, assigned_by}.
-- private_settings key admin_views: the shared "Full control", "Front desk" and "Lab and reports" layouts
-- once a manager has changed them (absent means the built-in layouts in admin.js).

alter table public.profiles add column if not exists admin_prefs jsonb not null default '{}';

create or replace function public._is_mgr() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role in ('owner','admin') or coalesce((perms->>'users')::boolean,false) from profiles where id = auth.uid() and active), false) $$;

create or replace function public.admin_ui_get() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c profiles; v jsonb; begin
  select * into c from profiles where id = auth.uid() and active;
  if c.id is null then raise exception 'Not allowed'; end if;
  begin select value::jsonb into v from private_settings where key = 'admin_views'; exception when others then v := null; end;
  return jsonb_build_object('views', v, 'mine', c.admin_prefs, 'manage', _is_mgr(),
    'staff', case when _is_mgr() then coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'email', p.email, 'name', p.name,
        'view', p.admin_prefs->>'view', 'can_edit', p.id = c.id or _may_edit(c, p), 'is_me', p.id = c.id) order by p.created_at)
      from profiles p where p.active), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- Anyone signed in may save their own view and arrangement.
create or replace function public.admin_ui_save_mine(p jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid() and active) then raise exception 'Not allowed'; end if;
  if jsonb_typeof(p) <> 'object' or length(p::text) > 30000 then raise exception 'Arrangement is too large'; end if;
  update profiles set admin_prefs = (admin_prefs - 'view' - 'mine') || jsonb_strip_nulls(jsonb_build_object('view', p->'view', 'mine', p->'mine')) where id = auth.uid();
end $$;

-- Owners, admins and staff with the Users permission may change the shared views.
create or replace function public.admin_ui_save_views(v jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  if not _is_mgr() then raise exception 'Only managers can change the shared views'; end if;
  if v is null or v = '{}'::jsonb then delete from private_settings where key = 'admin_views';
  else
    if jsonb_typeof(v) <> 'object' or length(v::text) > 60000 then raise exception 'Views are too large'; end if;
    insert into private_settings(key, value) values ('admin_views', v::text) on conflict (key) do update set value = excluded.value;
  end if;
  perform _log('Changed admin views', 'arrange', jsonb_build_object('views', (select coalesce(jsonb_agg(k), '[]') from jsonb_object_keys(coalesce(v,'{}')) k)));
end $$;

-- A manager chooses which view another staff member opens with. Same "who may change whom" rule as Users.
create or replace function public.admin_ui_assign(target uuid, view_id text) returns void language plpgsql security definer set search_path = public as $$
declare c profiles; t profiles; begin
  select * into c from profiles where id = auth.uid() and active;
  select * into t from profiles where id = target;
  if c.id is null or t.id is null or not _is_mgr() or not (t.id = c.id or _may_edit(c, t)) then raise exception 'Not allowed'; end if;
  if view_id is not null and view_id !~ '^[a-z0-9_]{1,24}$' then raise exception 'Unknown view'; end if;
  update profiles set admin_prefs = case when view_id is null then admin_prefs - 'view' - 'assigned_by'
    else admin_prefs || jsonb_build_object('view', view_id, 'assigned_by', c.email) end where id = target;
  perform _log('Set default admin view', 'arrange', jsonb_build_object('email', t.email, 'view', view_id));
end $$;

-- Numbers for the Dashboard. Each block appears only for people with that permission.
create or replace function public.admin_dashboard() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb := '{}'; today date := (now() at time zone 'Asia/Karachi')::date; t0 timestamptz := (today::timestamp at time zone 'Asia/Karachi'); begin
  if not exists (select 1 from profiles where id = auth.uid() and active) then raise exception 'Not allowed'; end if;
  if _can('bookings') then r := r || jsonb_build_object('bookings', jsonb_build_object(
    'by', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from bookings group by 1) x), '{}'),
    'today', (select count(*) from bookings where created_at >= t0),
    'week', (select count(*) from bookings where created_at >= now() - interval '7 days'),
    'home', (select count(*) from bookings where collection = 'home' and status in ('new','confirmed')),
    'recent', coalesce((select jsonb_agg(x) from (select ref, name, status, created_at, collection from bookings order by created_at desc limit 5) x), '[]'))); end if;
  if _can('reports') then r := r || jsonb_build_object('reports', jsonb_build_object(
    'by', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from reports group by 1) x), '{}'),
    'week', (select count(*) from reports where approved_at >= now() - interval '7 days'),
    'ready_no_report', (select count(*) from bookings b where b.status = 'report_ready' and not exists (select 1 from reports x where x.booking_id = b.id and x.status = 'approved')))); end if;
  if _can('patients') then r := r || jsonb_build_object('patients', jsonb_build_object(
    'total', (select count(*) from patients), 'month', (select count(*) from patients where created_at >= now() - interval '30 days'))); end if;
  if _can('conversations') then r := r || jsonb_build_object('mail', jsonb_build_object(
    'unread', (select count(*) from mail_threads where folder = 'inbox' and unread > 0),
    'inbox', (select count(*) from mail_threads where folder = 'inbox'),
    'starred', (select count(*) from mail_threads where starred and folder <> 'trash'),
    'spam', (select count(*) from mail_threads where folder = 'spam'),
    'week_in', (select count(*) from mail_messages where kind = 'in' and at >= now() - interval '7 days'),
    'recent', coalesce((select jsonb_agg(x) from (select subject, contact_name, contact_email, unread, last_at from mail_threads where folder = 'inbox' order by last_at desc limit 5) x), '[]'))); end if;
  if _can('messages') then r := r || jsonb_build_object('messages', jsonb_build_object(
    'sent', (select count(*) from email_log where status = 'sent' and at >= now() - interval '30 days'),
    'failed', (select count(*) from email_log where status <> 'sent' and at >= now() - interval '30 days'),
    'templates', (select count(*) from email_templates), 'contacts', (select count(*) from email_contacts),
    'consent', (select count(distinct lower(email)) from bookings where email_consent and email <> ''))); end if;
  if _can('blog') or _can('blog_agent') then r := r || jsonb_build_object('blog', jsonb_build_object(
    'by', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from blog_posts group by 1) x), '{}'),
    'week', (select count(*) from blog_posts where status = 'published' and published_at >= now() - interval '7 days'),
    'review', coalesce((select jsonb_agg(x) from (select title, lang, created_at from blog_posts where status = 'review' or needs_review order by created_at desc limit 5) x), '[]'))); end if;
  if _can('visitors') then r := r || jsonb_build_object('visitors', jsonb_build_object(
    'today', (select count(*) from site_hits where entry and at >= t0),
    'week', (select count(*) from site_hits where entry and at >= now() - interval '7 days'),
    'people', (select count(distinct vid) from site_hits where at >= now() - interval '7 days'),
    'search', (select count(*) from site_hits where entry and at >= now() - interval '7 days' and source in ('Google','Bing','Other search engines')))); end if;
  if _can('daily') then r := r || jsonb_build_object('health', (select jsonb_build_object('at', at, 'run', run, 'problems', coalesce(jsonb_array_length(case when jsonb_typeof(issues) = 'array' then issues end), 0))
    from health_checks order by at desc limit 1)); end if;
  if _can('loyalty') then r := r || jsonb_build_object('loyalty', jsonb_build_object('adjust', (select count(*) from loyalty_adjustments where at >= now() - interval '30 days'))); end if;
  if _is_mgr() then r := r || jsonb_build_object('staff', jsonb_build_object('active', (select count(*) from profiles where active))); end if;
  return r;
end $$;

revoke all on function public._is_mgr(), public.admin_ui_get(), public.admin_ui_save_mine(jsonb), public.admin_ui_save_views(jsonb),
  public.admin_ui_assign(uuid, text), public.admin_dashboard() from public, anon;
grant execute on function public._is_mgr(), public.admin_ui_get(), public.admin_ui_save_mine(jsonb), public.admin_ui_save_views(jsonb),
  public.admin_ui_assign(uuid, text), public.admin_dashboard() to authenticated;
