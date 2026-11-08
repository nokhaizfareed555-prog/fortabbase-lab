-- Fort Abbas Poly Clinic Laboratories: core schema.
-- Rule: the browser can only READ public tables. Every write goes through a function below,
-- which checks the caller's permission at that moment, so permission changes are instant.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text default '',
  role text not null default 'user' check (role in ('owner','admin','user')),
  perms jsonb not null default '{}',
  protected boolean not null default false,
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.site_sections (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_email text,
  action text not null,
  area text not null,
  detail jsonb not null default '{}'
);
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default upper(substr(md5(gen_random_uuid()::text),1,7)),
  created_at timestamptz not null default now(),
  kind text not null default 'booking' check (kind in ('booking','inquiry')),
  name text not null, phone text not null,
  age text default '', gender text default '', address text default '',
  collection text not null default 'visit' check (collection in ('visit','home')),
  preferred_at text default '', message text default '',
  items jsonb not null default '[]', total numeric not null default 0,
  status text not null default 'new' check (status in ('new','confirmed','sample_collected','processing','report_ready','completed','cancelled')),
  notes text default ''
);
create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, title text not null,
  excerpt text default '', body_md text default '', image text default '', category text default 'Awareness',
  status text not null default 'draft' check (status in ('draft','review','published')),
  sources jsonb not null default '[]', faq jsonb not null default '[]',
  seo_title text default '', seo_desc text default '', author text default '',
  published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.ai_keys (
  provider text primary key, value text not null,
  updated_at timestamptz not null default now(), updated_by text
);

alter table public.profiles enable row level security;
alter table public.site_sections enable row level security;
alter table public.audit_log enable row level security;
alter table public.bookings enable row level security;
alter table public.blog_posts enable row level security;
alter table public.ai_keys enable row level security;
-- Only these two are directly readable. No policy on the others means no direct access at all.
create policy public_read on public.site_sections for select to anon, authenticated using (true);
create policy public_read on public.blog_posts for select to anon, authenticated using (status = 'published');

create function public._me() returns public.profiles language sql stable security definer set search_path = public as
$$ select * from profiles where id = auth.uid() and active $$;

create function public._can(p text) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'owner' or coalesce((perms->>p)::boolean, false) from profiles where id = auth.uid() and active), false) $$;

create function public._log(a text, ar text, d jsonb default '{}') returns void language sql security definer set search_path = public as
$$ insert into audit_log(actor_email, action, area, detail) values ((select email from profiles where id = auth.uid()), a, ar, d) $$;

-- Who may change whom. Protected owners can never be changed, including by each other.
create function public._may_edit(caller public.profiles, t public.profiles) returns boolean language sql immutable as $$
  select caller.id is not null and t.id <> caller.id and not t.protected and (
    caller.role = 'owner' or (caller.role = 'admin' and t.role <> 'owner'))
$$;

create function public.my_profile() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'email', email, 'name', name, 'perms', perms,
    'real_role', role, 'must_change_password', must_change_password,
    -- A staff member only ever learns the titles their own level is allowed to see.
    'role', role) from profiles where id = auth.uid() and active
$$;

-- Visibility: owners see true titles. Admins see owners as admins. Users see everyone as users.
create function public.list_staff() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c profiles; begin
  select * into c from profiles where id = auth.uid() and active;
  if c.id is null then raise exception 'Not allowed'; end if;
  if not (c.role in ('owner','admin') or _can('users')) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'email', p.email, 'name', p.name,
      'role', case when c.role = 'owner' then p.role
                   when c.role = 'admin' then case when p.role = 'owner' then 'admin' else p.role end
                   else 'user' end,
      'perms', case when c.role in ('owner','admin') and p.role <> 'owner' or c.role = 'owner' then p.perms else '{}'::jsonb end,
      'active', p.active,
      'can_edit', _may_edit(c, p) and c.role in ('owner','admin'),
      'is_me', p.id = c.id
    ) order by p.created_at) from profiles p), '[]'::jsonb);
end $$;

create function public.set_staff(target uuid, new_role text, new_perms jsonb, new_name text, new_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c profiles; t profiles; begin
  select * into c from profiles where id = auth.uid() and active;
  select * into t from profiles where id = target;
  if c.id is null or t.id is null or c.role = 'user' or not _may_edit(c, t) then raise exception 'Not allowed'; end if;
  if c.role = 'admin' and new_role = 'owner' then raise exception 'Not allowed'; end if;
  update profiles set role = new_role, perms = new_perms, name = coalesce(new_name, name), active = new_active where id = target;
  perform _log('Changed staff member', 'users', jsonb_build_object('email', t.email, 'role', jsonb_build_array(t.role, new_role),
    'active', new_active, 'perms', new_perms));
end $$;

create function public.save_section(k text, v jsonb) returns timestamptz language plpgsql security definer set search_path = public as $$
declare old jsonb; ts timestamptz := now(); changed jsonb; begin
  if not _can(k) then raise exception 'You do not have permission to change this section'; end if;
  select data into old from site_sections where key = k;
  select coalesce(jsonb_agg(e.key), '[]') into changed from jsonb_each(v) e
    where old is null or old->e.key is distinct from e.value;
  insert into site_sections(key, data, updated_at, updated_by)
    values (k, v, ts, (select email from profiles where id = auth.uid()))
    on conflict (key) do update set data = excluded.data, updated_at = ts, updated_by = excluded.updated_by;
  perform _log('Saved section', k, jsonb_build_object('fields', changed, 'before', old, 'after', v));
  return ts;
end $$;

create function public.create_booking(b jsonb) returns text language plpgsql security definer set search_path = public as $$
declare tests jsonb; item jsonb; items jsonb := '[]'; t jsonb; v jsonb; total numeric := 0; p numeric; r text; begin
  if length(trim(coalesce(b->>'name',''))) < 2 or length(regexp_replace(coalesce(b->>'phone',''),'\D','','g')) < 10 then
    raise exception 'Please enter your name and a valid phone number'; end if;
  select data->'items' into tests from site_sections where key = 'tests';
  -- Prices are looked up here, never trusted from the browser. Before tests are published, prices stay blank.
  for item in select * from jsonb_array_elements(coalesce(b->'items','[]')) loop
    select x into t from jsonb_array_elements(coalesce(tests,'[]')) x where x->>'id' = item->>'id';
    p := nullif(t->>'price','')::numeric;
    if item->>'variant' is not null and t is not null then
      select x into v from jsonb_array_elements(coalesce(t->'variants','[]')) x where x->>'name' = item->>'variant';
      if v is not null then p := nullif(v->>'price','')::numeric; end if;
    end if;
    p := round(coalesce(p,0) * (100 - coalesce(nullif(t->>'discount','')::numeric,0)) / 100);
    total := total + p;
    items := items || jsonb_build_object('id', item->>'id', 'name', coalesce(t->>'name', left(item->>'name',120)), 'variant', item->>'variant', 'price', p);
  end loop;
  insert into bookings(kind,name,phone,age,gender,address,collection,preferred_at,message,items,total)
  values (coalesce(nullif(b->>'kind',''),'booking'), left(b->>'name',120), left(b->>'phone',30), left(coalesce(b->>'age',''),10),
    left(coalesce(b->>'gender',''),20), left(coalesce(b->>'address',''),400), coalesce(nullif(b->>'collection',''),'visit'),
    left(coalesce(b->>'preferred_at',''),60), left(coalesce(b->>'message',''),1000), items, total) returning ref into r;
  insert into audit_log(actor_email, action, area, detail) values ('website visitor',
    case when b->>'kind' = 'inquiry' then 'New inquiry' else 'New booking' end, 'bookings', jsonb_build_object('ref', r));
  return r;
end $$;

create function public.list_bookings() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin if not _can('bookings') then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(to_jsonb(b) order by created_at desc) from (select * from bookings order by created_at desc limit 500) b), '[]'); end $$;

create function public.update_booking(i uuid, new_status text, new_notes text) returns void language plpgsql security definer set search_path = public as $$
declare o bookings; begin
  if not _can('bookings') then raise exception 'Not allowed'; end if;
  select * into o from bookings where id = i;
  update bookings set status = new_status, notes = new_notes where id = i;
  perform _log('Updated booking', 'bookings', jsonb_build_object('ref', o.ref, 'status', jsonb_build_array(o.status, new_status)));
end $$;

create function public.list_audit(lim int default 300) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin if not _can('audit') then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(to_jsonb(a) order by id desc) from (select * from audit_log order by id desc limit least(lim,1000)) a), '[]'); end $$;

create function public.list_posts() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin if not _can('blog') then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(to_jsonb(p) order by created_at desc) from blog_posts p), '[]'); end $$;

create function public.save_post(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare i uuid := nullif(p->>'id','')::uuid; st text := coalesce(p->>'status','draft'); begin
  if not _can('blog') then raise exception 'Not allowed'; end if;
  if i is null then
    insert into blog_posts(slug,title) values (p->>'slug', p->>'title') returning id into i;
  end if;
  update blog_posts set slug=p->>'slug', title=p->>'title', excerpt=coalesce(p->>'excerpt',''), body_md=coalesce(p->>'body_md',''),
    image=coalesce(p->>'image',''), category=coalesce(p->>'category','Awareness'), status=st, sources=coalesce(p->'sources','[]'), faq=coalesce(p->'faq','[]'),
    seo_title=coalesce(p->>'seo_title',''), seo_desc=coalesce(p->>'seo_desc',''), author=coalesce(p->>'author',''),
    updated_at=now(), published_at=case when st='published' then coalesce(published_at, now()) else published_at end where id=i;
  perform _log('Saved article', 'blog', jsonb_build_object('title', p->>'title', 'status', st));
  return i;
end $$;

create function public.delete_post(i uuid) returns void language plpgsql security definer set search_path = public as $$
declare t text; begin
  if not _can('blog') then raise exception 'Not allowed'; end if;
  delete from blog_posts where id = i returning title into t;
  perform _log('Deleted article', 'blog', jsonb_build_object('title', t));
end $$;

create function public.set_ai_key(p text, k text) returns void language plpgsql security definer set search_path = public as $$
begin if not _can('blog_agent') then raise exception 'Not allowed'; end if;
  insert into ai_keys(provider,value,updated_by) values (p,k,(select email from profiles where id=auth.uid()))
    on conflict (provider) do update set value=excluded.value, updated_at=now(), updated_by=excluded.updated_by;
  perform _log('Saved AI key', 'blog_agent', jsonb_build_object('provider', p, 'ending', right(k,3)));
end $$;

create function public.ai_keys_info() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m profiles; begin
  select * into m from profiles where id = auth.uid() and active;
  if not _can('blog_agent') then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('provider',provider,'last3',right(value,3),'updated_at',updated_at,
    'can_view', m.role in ('owner','admin'))) from ai_keys), '[]');
end $$;

create function public.reveal_ai_key(p text) returns text language plpgsql security definer set search_path = public as $$
declare m profiles; v text; begin
  select * into m from profiles where id = auth.uid() and active;
  if m.id is null or m.role not in ('owner','admin') then raise exception 'Not allowed'; end if;
  select value into v from ai_keys where provider = p;
  perform _log('Viewed AI key', 'blog_agent', jsonb_build_object('provider', p));
  return v;
end $$;

create function public.password_changed() returns void language sql security definer set search_path = public as
$$ update profiles set must_change_password = false where id = auth.uid() $$;

-- Lock everything down, then open only what the site needs.
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.create_booking(jsonb) to anon, authenticated;
grant execute on function public.my_profile(), public.list_staff(), public.set_staff(uuid,text,jsonb,text,boolean),
  public.save_section(text,jsonb), public.list_bookings(), public.update_booking(uuid,text,text), public.list_audit(int),
  public.list_posts(), public.save_post(jsonb), public.delete_post(uuid), public.set_ai_key(text,text),
  public.ai_keys_info(), public.reveal_ai_key(text), public.password_changed() to authenticated;
