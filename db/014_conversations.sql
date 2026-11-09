-- Conversations: two-way email inside the admin. The Edge Function "mailbox" reads the Hostinger mailbox by IMAP and sends by SMTP.
-- Permission key "conversations". Tables are reachable only through these functions.
create table if not exists public.mail_threads (
 id uuid primary key default gen_random_uuid(), subject text not null default '', subj_key text not null default '',
 contact_email text not null default '', contact_name text not null default '',
 folder text not null default 'inbox' check (folder in ('inbox','archive','spam','trash')),
 starred boolean not null default false, unread int not null default 0, snippet text not null default '', last_at timestamptz not null default now(),
 has_in boolean not null default false, has_out boolean not null default false, has_attach boolean not null default false, msg_count int not null default 0,
 assignee uuid references public.profiles(id) on delete set null, labels text[] not null default '{}', created_at timestamptz not null default now());
create table if not exists public.mail_messages (
 id uuid primary key default gen_random_uuid(), thread_id uuid not null references public.mail_threads(id) on delete cascade,
 message_id text unique, refs text[] not null default '{}', kind text not null check (kind in ('in','out','note')),
 from_email text not null default '', from_name text not null default '', reply_to text not null default '',
 to_list jsonb not null default '[]', cc_list jsonb not null default '[]', bcc_list jsonb not null default '[]',
 subject text not null default '', body_text text not null default '', body_html text not null default '', attachments jsonb not null default '[]',
 at timestamptz not null default now(), sent_by text not null default '');
create table if not exists public.mail_sync (folder text primary key, uidvalidity bigint not null default 0, last_uid bigint not null default 0, try_uid bigint not null default 0, tries int not null default 0);
create table if not exists public.mail_settings (id int primary key default 1 check (id=1), signature text not null default '', last_sync_at timestamptz, last_error text not null default '');
insert into public.mail_settings(id) values (1) on conflict do nothing;
create index if not exists mail_threads_last on public.mail_threads(last_at desc);
create index if not exists mail_messages_thread on public.mail_messages(thread_id, at);
create index if not exists mail_messages_refs on public.mail_messages using gin(refs);
alter table public.mail_threads enable row level security; alter table public.mail_messages enable row level security;
alter table public.mail_sync enable row level security; alter table public.mail_settings enable row level security;
revoke all on public.mail_threads, public.mail_messages, public.mail_sync, public.mail_settings from anon, authenticated;
insert into storage.buckets (id, name, public) values ('mail','mail',false) on conflict (id) do nothing;

create or replace function public._mail_key(s text) returns text language sql immutable as
$$ select lower(trim(regexp_replace(coalesce(s,''), '^(\s*(re|fw|fwd)(\[\d+\])?\s*:\s*)+', '', 'i'))) $$;

-- Saves one message and files it in a conversation. Only the mailbox function (service role) can call it.
create or replace function public._mail_ingest(m jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid := nullif(m->>'thread_id','')::uuid; mid text := nullif(m->>'message_id',''); k text := m->>'kind'; sub text := coalesce(m->>'subject','');
 ky text := _mail_key(sub); ce text := lower(coalesce(m->>'contact_email','')); cn text := coalesce(m->>'contact_name',''); ts timestamptz := coalesce((m->>'at')::timestamptz, now());
 rf text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(m->'refs','[]')) x), '{}'); att jsonb := coalesce(m->'attachments','[]');
 plain text := coalesce(m->>'body_text',''); src text := coalesce(m->>'folder','inbox'); seen boolean := coalesce((m->>'seen')::boolean, false); snip text; nid uuid;
begin
 if mid is not null and exists(select 1 from mail_messages where message_id=mid) then return null; end if;
 if t is null and cardinality(rf)>0 then select thread_id into t from mail_messages where message_id=any(rf) order by at desc limit 1; end if;
 if t is null and ky<>'' and ce<>'' then select id into t from mail_threads where subj_key=ky and contact_email=ce and last_at>ts-interval '90 days' order by last_at desc limit 1; end if;
 snip := left(trim(regexp_replace(plain,'\s+',' ','g')),160);
 if t is null then insert into mail_threads(subject,subj_key,contact_email,contact_name,folder,last_at) values (left(sub,300),ky,ce,left(cn,200),case when src='spam' then 'spam' else 'inbox' end,ts) returning id into t; end if;
 insert into mail_messages(thread_id,message_id,refs,kind,from_email,from_name,reply_to,to_list,cc_list,bcc_list,subject,body_text,body_html,attachments,at,sent_by)
 values (t,mid,rf,k,lower(coalesce(m->>'from_email','')),left(coalesce(m->>'from_name',''),200),lower(coalesce(m->>'reply_to','')),coalesce(m->'to_list','[]'),coalesce(m->'cc_list','[]'),coalesce(m->'bcc_list','[]'),left(sub,300),left(plain,200000),left(coalesce(m->>'body_html',''),600000),att,ts,coalesce(m->>'sent_by','')) returning id into nid;
 update mail_threads set msg_count=msg_count+1, has_in=has_in or k='in', has_out=has_out or k='out', has_attach=has_attach or jsonb_array_length(att)>0,
  unread=unread+case when k='in' and not seen then 1 else 0 end,
  snippet=case when ts>=last_at then snip else snippet end, last_at=greatest(last_at,ts),
  contact_name=case when contact_name='' then left(cn,200) else contact_name end,
  folder=case when k='in' and not seen and src<>'spam' and folder in ('archive','trash') then 'inbox' else folder end where id=t;
 return t;
end $$;
revoke all on function public._mail_ingest(jsonb), public._mail_key(text) from public, anon, authenticated;

create or replace function public.mail_list(p_view text default 'inbox', p_q text default '', p_label text default '', p_limit int default 60, p_offset int default 0) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(trim(coalesce(p_q,'')),''); pat text; me uuid := auth.uid();
begin if not _can('conversations') then raise exception 'Not allowed'; end if;
 pat := '%'||replace(replace(replace(coalesce(q,''),'\','\\'),'%','\%'),'_','\_')||'%';
 return jsonb_build_object(
 'threads',(select coalesce(jsonb_agg(to_jsonb(x) order by x.last_at desc),'[]') from (select t.* from mail_threads t where
   case p_view when 'inbox' then folder='inbox' and has_in when 'unread' then folder='inbox' and unread>0 when 'starred' then starred and folder<>'trash'
    when 'mine' then assignee=me and folder not in ('trash','spam') when 'sent' then has_out and folder not in ('trash','spam') when 'archive' then folder='archive' when 'spam' then folder='spam' when 'trash' then folder='trash'
    else folder not in ('trash','spam') end
   and (p_label='' or p_label=any(labels))
   and (q is null or subject ilike pat or contact_email ilike pat or contact_name ilike pat or exists(select 1 from mail_messages m where m.thread_id=t.id and m.body_text ilike pat))
   order by last_at desc limit least(p_limit,200) offset greatest(p_offset,0)) x),
 'counts',(select jsonb_build_object('inbox',count(*) filter(where folder='inbox' and has_in),'unread',count(*) filter(where folder='inbox' and unread>0),'starred',count(*) filter(where starred and folder<>'trash'),'mine',count(*) filter(where assignee=me and folder not in('trash','spam')),'spam',count(*) filter(where folder='spam'),'trash',count(*) filter(where folder='trash')) from mail_threads),
 'labels',(select coalesce(jsonb_agg(distinct l),'[]') from mail_threads, unnest(labels) l),
 'sync',(select jsonb_build_object('at',last_sync_at,'error',last_error) from mail_settings where id=1));
end $$;

create or replace function public.mail_thread(p_id uuid, p_read boolean default true) returns jsonb language plpgsql security definer set search_path = public as $$
declare t mail_threads; can_book boolean := _can('bookings');
begin if not _can('conversations') then raise exception 'Not allowed'; end if;
 if p_read then update mail_threads set unread=0 where id=p_id and unread>0; end if;
 select * into t from mail_threads where id=p_id; if t.id is null then raise exception 'This conversation no longer exists'; end if;
 return jsonb_build_object('thread',to_jsonb(t),
 'messages',(select coalesce(jsonb_agg(to_jsonb(m) order by m.at),'[]') from mail_messages m where m.thread_id=p_id),
 'bookings',case when can_book and t.contact_email<>'' then (select coalesce(jsonb_agg(jsonb_build_object('ref',b.ref,'status',b.status,'name',b.name,'at',b.created_at) order by b.created_at desc),'[]') from (select * from bookings where lower(email)=t.contact_email order by created_at desc limit 5) b) else '[]'::jsonb end);
end $$;

create or replace function public.mail_meta() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin if not _can('conversations') then raise exception 'Not allowed'; end if;
 return jsonb_build_object('me',auth.uid(),'signature',(select signature from mail_settings where id=1),'mailbox',(select smtp_user from blog_settings where id=1),'name',(select smtp_name from blog_settings where id=1),
 'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(name,''),email)) order by email),'[]') from profiles where active and (role='owner' or coalesce((perms->>'conversations')::boolean,false))),
 'templates',(select coalesce(jsonb_agg(jsonb_build_object('name',name,'subject',subject,'body',body) order by name),'[]') from email_templates),
 'contacts',(select coalesce(jsonb_agg(c) ,'[]') from (select jsonb_build_object('name',max(contact_name),'email',contact_email) c from mail_threads where contact_email<>'' group by contact_email order by max(last_at) desc limit 300) z));
end $$;

create or replace function public.mail_update(p_ids uuid[], p_patch jsonb) returns void language plpgsql security definer set search_path = public as $$
declare f text := p_patch->>'folder'; lb text := left(trim(coalesce(p_patch->>'add_label','')),30); rm text := p_patch->>'remove_label';
begin if not _can('conversations') then raise exception 'Not allowed'; end if;
 if f is not null and f not in ('inbox','archive','spam','trash') then raise exception 'Unknown folder'; end if;
 update mail_threads set folder=coalesce(f,folder), starred=case when p_patch?'starred' then (p_patch->>'starred')::boolean else starred end,
  unread=case when p_patch?'read' then case when (p_patch->>'read')::boolean then 0 else greatest(unread,1) end else unread end,
  assignee=case when p_patch?'assignee' then nullif(p_patch->>'assignee','')::uuid else assignee end,
  labels=case when lb<>'' and not lb=any(labels) then array_append(labels,lb) when rm is not null then array_remove(labels,rm) else labels end
 where id=any(p_ids);
end $$;

create or replace function public.mail_note(p_thread uuid, p_text text) returns void language plpgsql security definer set search_path = public as $$
declare me text := (select coalesce(nullif(name,''),email) from profiles where id=auth.uid()); ts timestamptz := now();
begin if not _can('conversations') then raise exception 'Not allowed'; end if;
 if length(trim(coalesce(p_text,'')))=0 then raise exception 'Write the note first'; end if;
 insert into mail_messages(thread_id,kind,body_text,at,sent_by) values (p_thread,'note',left(p_text,20000),ts,me);
 update mail_threads set msg_count=msg_count+1 where id=p_thread;
end $$;

create or replace function public.mail_save_signature(p_text text) returns void language plpgsql security definer set search_path = public as $$
begin if not _can('conversations') then raise exception 'Not allowed'; end if;
 update mail_settings set signature=left(coalesce(p_text,''),2000) where id=1; perform _log('Changed email signature','conversations');
end $$;
revoke all on function public.mail_list(text,text,text,int,int), public.mail_thread(uuid,boolean), public.mail_meta(), public.mail_update(uuid[],jsonb), public.mail_note(uuid,text), public.mail_save_signature(text) from public, anon;
grant execute on function public.mail_list(text,text,text,int,int), public.mail_thread(uuid,boolean), public.mail_meta(), public.mail_update(uuid[],jsonb), public.mail_note(uuid,text), public.mail_save_signature(text) to authenticated;

create or replace function public._mail_kick() returns void language plpgsql security definer set search_path = public, extensions as $$
begin perform net.http_post(url := 'https://mdndkrpyrcgrpytdtiim.supabase.co/functions/v1/mailbox', headers := jsonb_build_object('content-type','application/json','x-hook-secret',(select hook_secret from blog_secrets where id=1)), body := '{"action":"sync"}'::jsonb, timeout_milliseconds := 120000); end $$;
revoke all on function public._mail_kick() from public, anon, authenticated;
