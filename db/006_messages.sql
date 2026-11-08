-- Messages: email templates, saved contacts and a send log. All access goes through the functions below.
create table if not exists public.email_templates (
  key text primary key check (key ~ '^[a-z0-9_]{1,60}$'),
  name text not null check (length(name) between 1 and 120),
  subject text not null default '' check (length(subject) <= 200),
  body text not null default '' check (length(body) <= 20000),
  builtin boolean not null default false,
  updated_at timestamptz not null default now(), updated_by text);
create table if not exists public.email_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  name text not null default '' check (length(name) <= 120),
  note text not null default '' check (length(note) <= 300),
  created_at timestamptz not null default now());
create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(), actor text, template text, recipient text not null,
  subject text not null default '', status text not null check (status in ('sent','failed')), error text, provider_id text);
create index if not exists email_log_at on public.email_log(at desc);
alter table public.email_templates enable row level security;
alter table public.email_contacts enable row level security;
alter table public.email_log enable row level security;
revoke all on public.email_templates, public.email_contacts, public.email_log from anon, authenticated;
alter table public.blog_settings add column if not exists email_reply_to text not null default '' check (length(email_reply_to) <= 254);

insert into public.email_templates(key,name,subject,body,builtin) values
('booking_received','Booking received','We received your booking {{ref}}',E'Dear {{name}},\n\nThank you for booking with {{clinic}}. Your booking number is {{ref}}.\n\nWe will contact you shortly to confirm it. For help, call {{phone}}.\n\nRegards,\n{{clinic}}',true),
('booking_confirmed','Booking confirmed','Your booking {{ref}} is confirmed',E'Dear {{name}},\n\nYour booking {{ref}} is confirmed for {{date}}.\n\nFor help or to change the time, call {{phone}}.\n\nRegards,\n{{clinic}}',true),
('home_sample','Home sample visit','Home sample collection on {{date}}',E'Dear {{name}},\n\nOur team will visit you on {{date}} to collect your sample for booking {{ref}}.\n\nFor help, call {{phone}}.\n\nRegards,\n{{clinic}}',true),
('report_ready','Report ready','Your lab report is ready',E'Dear {{name}},\n\nYour report for {{test}} is ready. Sign in on our website to view it, or collect a copy from the clinic.\n\nPlease discuss your results with your doctor.\n\nRegards,\n{{clinic}}',true),
('general','General message','A message from {{clinic}}',E'Dear {{name}},\n\n\n\nRegards,\n{{clinic}}',true)
on conflict (key) do nothing;

create or replace function public.msg_get() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin if not _can('messages') then raise exception 'Not allowed'; end if;
return jsonb_build_object(
 'templates',(select coalesce(jsonb_agg(to_jsonb(t) order by t.builtin desc,t.name),'[]') from email_templates t),
 'contacts',(select coalesce(jsonb_agg(to_jsonb(c) order by c.name,c.email),'[]') from email_contacts c),
 'log',(select coalesce(jsonb_agg(to_jsonb(l) order by l.id desc),'[]') from (select * from email_log order by id desc limit 200) l),
 'from',(select email_from from blog_settings where id=1),'reply_to',(select email_reply_to from blog_settings where id=1),
 'key_set',(select length(resend_api_key)>0 from blog_secrets where id=1));
end $$;
create or replace function public.msg_save_settings(p_from text,p_reply text,p_key text default null) returns void language plpgsql security definer set search_path = public as $$
begin if not _can('messages') then raise exception 'Not allowed'; end if;
 if coalesce(p_from,'')<>'' and p_from !~ '^([^<>]+<)?[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>?$' then raise exception 'Enter the sender like: Fort Abbas Poly Clinic <info@yourdomain.com>'; end if;
 if coalesce(p_reply,'')<>'' and p_reply !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'The reply address is not a valid email'; end if;
 update blog_settings set email_from=trim(coalesce(p_from,'')),email_reply_to=trim(coalesce(p_reply,'')) where id=1;
 if nullif(trim(coalesce(p_key,'')),'') is not null then update blog_secrets set resend_api_key=trim(p_key) where id=1; end if;
 perform _log('Changed email setup','messages');
end $$;
create or replace function public.msg_save_template(p jsonb) returns text language plpgsql security definer set search_path = public as $$
declare k text := coalesce(nullif(p->>'key',''),'t_'||substr(md5(gen_random_uuid()::text),1,10));
begin if not _can('messages') then raise exception 'Not allowed'; end if;
 insert into email_templates(key,name,subject,body,updated_at,updated_by) values (k,p->>'name',coalesce(p->>'subject',''),coalesce(p->>'body',''),now(),my_email())
 on conflict (key) do update set name=excluded.name,subject=excluded.subject,body=excluded.body,updated_at=now(),updated_by=excluded.updated_by;
 perform _log('Saved email template','messages',jsonb_build_object('title',p->>'name')); return k;
end $$;
create or replace function public.msg_delete_template(k text) returns void language plpgsql security definer set search_path = public as $$
begin if not _can('messages') then raise exception 'Not allowed'; end if;
 delete from email_templates where key=k and not builtin; perform _log('Deleted email template','messages',jsonb_build_object('title',k));
end $$;
create or replace function public.msg_save_contacts(p jsonb) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin if not _can('messages') then raise exception 'Not allowed'; end if;
 insert into email_contacts(email,name,note) select lower(trim(x->>'email')),coalesce(x->>'name',''),coalesce(x->>'note','') from jsonb_array_elements(p) x
 on conflict (email) do update set name=case when excluded.name<>'' then excluded.name else email_contacts.name end,note=case when excluded.note<>'' then excluded.note else email_contacts.note end;
 get diagnostics n=row_count; perform _log('Saved email contacts','messages'); return n;
end $$;
create or replace function public.msg_delete_contact(i uuid) returns void language plpgsql security definer set search_path = public as $$
begin if not _can('messages') then raise exception 'Not allowed'; end if; delete from email_contacts where id=i; perform _log('Deleted email contact','messages'); end $$;
revoke all on function public.msg_get(),public.msg_save_settings(text,text,text),public.msg_save_template(jsonb),public.msg_delete_template(text),public.msg_save_contacts(jsonb),public.msg_delete_contact(uuid) from public,anon;
grant execute on function public.msg_get(),public.msg_save_settings(text,text,text),public.msg_save_template(jsonb),public.msg_delete_template(text),public.msg_save_contacts(jsonb),public.msg_delete_contact(uuid) to authenticated;
