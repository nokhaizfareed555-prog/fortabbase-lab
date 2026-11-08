-- Messages: each email template keeps its own look (layout, colours, font, badge and button).
alter table public.email_templates add column if not exists design jsonb check (design is null or pg_column_size(design) <= 4000);
update public.email_templates set design='{"badge":"Booking received"}' where key='booking_received' and design is null;
update public.email_templates set design='{"badge":"Confirmed"}' where key='booking_confirmed' and design is null;
update public.email_templates set design='{"badge":"Home visit"}' where key='home_sample' and design is null;
update public.email_templates set design='{"badge":"Report ready","btn":"View your report","url":"https://fortabbaspolyclinic.com/reports"}' where key='report_ready' and design is null;

create or replace function public.msg_save_template(p jsonb) returns text language plpgsql security definer set search_path = public as $$
declare k text := coalesce(nullif(p->>'key',''),'t_'||substr(md5(gen_random_uuid()::text),1,10));
begin if not _can('messages') then raise exception 'Not allowed'; end if;
 insert into email_templates(key,name,subject,body,design,updated_at,updated_by) values (k,p->>'name',coalesce(p->>'subject',''),coalesce(p->>'body',''),nullif(p->'design','null'::jsonb),now(),my_email())
 on conflict (key) do update set name=excluded.name,subject=excluded.subject,body=excluded.body,design=excluded.design,updated_at=now(),updated_by=excluded.updated_by;
 perform _log('Saved email template','messages',jsonb_build_object('title',p->>'name')); return k;
end $$;

create or replace function public.msg_apply_design(d jsonb) returns void language plpgsql security definer set search_path = public as $$
declare look jsonb := (select coalesce(jsonb_object_agg(k,v),'{}'::jsonb) from jsonb_each(d) e(k,v) where k in ('layout','primary','accent','bg','font','logo'));
begin if not _can('messages') then raise exception 'Not allowed'; end if;
 update email_templates set design=coalesce(design,'{}'::jsonb)||look,updated_at=now(),updated_by=my_email() where true;
 perform _log('Applied email look to all templates','messages');
end $$;
revoke all on function public.msg_apply_design(jsonb) from public,anon;
grant execute on function public.msg_apply_design(jsonb) to authenticated;
