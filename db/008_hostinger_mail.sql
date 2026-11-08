-- Messages: send through the clinic's Hostinger mailbox (SMTP) as well as Resend.
alter table public.blog_settings add column if not exists email_provider text not null default 'smtp' check (email_provider in ('smtp','resend'));
alter table public.blog_settings add column if not exists smtp_user text not null default '' check (length(smtp_user) <= 254);
alter table public.blog_settings add column if not exists smtp_name text not null default 'Fort Abbas Poly Clinic' check (length(smtp_name) <= 120);
alter table public.blog_secrets add column if not exists smtp_password text not null default '';

create or replace function public.msg_get() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin if not _can('messages') then raise exception 'Not allowed'; end if;
return jsonb_build_object(
 'templates',(select coalesce(jsonb_agg(to_jsonb(t) order by t.builtin desc,t.name),'[]') from email_templates t),
 'contacts',(select coalesce(jsonb_agg(to_jsonb(c) order by c.name,c.email),'[]') from email_contacts c),
 'log',(select coalesce(jsonb_agg(to_jsonb(l) order by l.id desc),'[]') from (select * from email_log order by id desc limit 200) l),
 'from',(select email_from from blog_settings where id=1),'reply_to',(select email_reply_to from blog_settings where id=1),
 'provider',(select email_provider from blog_settings where id=1),'smtp_user',(select smtp_user from blog_settings where id=1),'smtp_name',(select smtp_name from blog_settings where id=1),
 'smtp_set',(select length(smtp_password)>0 from blog_secrets where id=1),
 'key_set',(select length(resend_api_key)>0 from blog_secrets where id=1));
end $$;

create or replace function public.msg_save_settings(p_from text,p_reply text,p_key text default null) returns void language plpgsql security definer set search_path = public as $$
begin if not _can('messages') then raise exception 'Not allowed'; end if;
 if coalesce(p_from,'')<>'' and p_from !~ '^([^<>]+<)?[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>?$' then raise exception 'Enter the sender like: Fort Abbas Poly Clinic <info@yourdomain.com>'; end if;
 if coalesce(p_reply,'')<>'' and p_reply !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'The reply address is not a valid email'; end if;
 update blog_settings set email_from=trim(coalesce(p_from,'')),email_reply_to=trim(coalesce(p_reply,'')),email_provider='resend' where id=1;
 if nullif(trim(coalesce(p_key,'')),'') is not null then update blog_secrets set resend_api_key=trim(p_key) where id=1; end if;
 perform _log('Changed email setup','messages');
end $$;

create or replace function public.msg_save_smtp(p_user text,p_name text,p_reply text,p_password text default null) returns void language plpgsql security definer set search_path = public as $$
declare u text := lower(trim(coalesce(p_user,'')));
begin if not _can('messages') then raise exception 'Not allowed'; end if;
 if u !~ '^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$' then raise exception 'Enter the full mailbox address, like info@fortabbaspolyclinic.com'; end if;
 if length(trim(coalesce(p_name,'')))=0 then raise exception 'Enter the name people will see'; end if;
 if coalesce(p_reply,'')<>'' and trim(p_reply) !~ '^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$' then raise exception 'The reply address is not a valid email'; end if;
 update blog_settings set smtp_user=u,smtp_name=trim(p_name),email_reply_to=trim(coalesce(p_reply,'')),email_provider='smtp' where id=1;
 if coalesce(p_password,'')<>'' then update blog_secrets set smtp_password=p_password where id=1; end if;
 perform _log('Changed email setup','messages');
end $$;
revoke all on function public.msg_save_smtp(text,text,text,text) from public,anon;
grant execute on function public.msg_save_smtp(text,text,text,text) to authenticated;
