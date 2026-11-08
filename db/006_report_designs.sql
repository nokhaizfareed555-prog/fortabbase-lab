-- Saves the chosen design with each lab report and adds a lab-wide default design.
-- Reports without a design keep the Clinic Classic look.
alter table public.reports add column if not exists design jsonb;

create or replace function public.admin_reports() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin if not _can('reports') then raise exception 'Not allowed'; end if;
 return coalesce((select jsonb_agg(x order by x.collected_at desc,x.created_at desc) from (select r.*,p.code,p.name,p.phone,b.age,b.gender from reports r join patients p on p.id=r.patient_id left join bookings b on b.id=r.booking_id order by r.collected_at desc limit 500) x),'[]'); end $$;

create or replace function public.admin_save_report(r jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare i uuid := nullif(r->>'id','')::uuid; st text := coalesce(r->>'status','draft'); pid uuid := nullif(r->>'patient_id','')::uuid; bid uuid := nullif(r->>'booking_id','')::uuid; res jsonb := coalesce(r->'results','[]'); who text; rel text := left(trim(coalesce(r->>'relation','')),40); pn text := left(trim(coalesce(r->>'person_name','')),120); des jsonb := case when jsonb_typeof(r->'design')='object' and length((r->'design')::text)<500 then r->'design' end; begin
 if not _can('reports') then raise exception 'Not allowed'; end if;
 if pid is null then raise exception 'Choose a patient'; end if;
 if rel<>'' and length(pn)<2 then raise exception 'Enter the name of the person this report is for'; end if;
 if rel='' then pn:=''; end if;
 if st='approved' and (jsonb_array_length(res)=0 or exists (select 1 from jsonb_array_elements(res) e where trim(coalesce(e->>'value',''))='')) then raise exception 'Enter a result for every test before approving'; end if;
 select email into who from profiles where id=auth.uid();
 if i is null then insert into reports(patient_id,booking_id,title,collected_at,status,results,notes,signed_by,approved_at,approved_by,relation,person_name,design)
   values (pid,bid,left(coalesce(r->>'title',''),200),coalesce(nullif(r->>'collected_at','')::date,current_date),st,res,left(coalesce(r->>'notes',''),2000),left(coalesce(r->>'signed_by',''),120),case when st='approved' then now() end,case when st='approved' then who end,rel,pn,des) returning id into i;
 else update reports set title=left(coalesce(r->>'title',''),200),collected_at=coalesce(nullif(r->>'collected_at','')::date,collected_at),status=st,results=res,notes=left(coalesce(r->>'notes',''),2000),signed_by=left(coalesce(r->>'signed_by',''),120),relation=rel,person_name=pn,design=coalesce(des,design),updated_at=now(),approved_at=case when st='approved' then coalesce(approved_at,now()) end,approved_by=case when st='approved' then coalesce(approved_by,who) end where id=i; end if;
 if st='approved' and bid is not null then update bookings set status='report_ready' where id=bid and status not in ('completed','cancelled'); end if;
 perform _log(case when st='approved' then 'Approved lab report' else 'Saved lab report' end,'reports',jsonb_build_object('title',r->>'title')); return i; end $$;

create or replace function public.patient_reports(t text) returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare p patients; begin
  select x.* into p from patient_sessions s join patients x on x.id=s.patient_id where s.token_hash=encode(digest(coalesce(t,''),'sha256'),'hex') and s.expires_at>now();
  if not found then return jsonb_build_object('error','expired'); end if;
  return jsonb_build_object('patient',jsonb_build_object('name',p.name,'code',p.code),
    'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'collected_at',r.collected_at,'approved_at',r.approved_at,'results',r.results,'notes',r.notes,'signed_by',r.signed_by,'person_name',r.person_name,'relation',r.relation,'age',b.age,'gender',b.gender,'design',r.design) order by r.collected_at desc, r.approved_at desc) from reports r left join bookings b on b.id=r.booking_id where r.patient_id=p.id and r.status='approved'),'[]')); end $$;

create function public.admin_report_designs() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin if not _can('reports') then raise exception 'Not allowed'; end if;
 return jsonb_build_object('default',(select value::jsonb from private_settings where key='report_design'),'last',(select design from reports where design is not null order by updated_at desc limit 1)); end $$;

create function public.admin_set_report_default(d jsonb) returns void language plpgsql security definer set search_path = public as $$
begin if not _can('reports') then raise exception 'Not allowed'; end if;
 if jsonb_typeof(d)<>'object' or length(d::text)>=500 then raise exception 'Not a valid design'; end if;
 insert into private_settings values ('report_design',d::text) on conflict (key) do update set value=excluded.value;
 perform _log('Changed default report design','reports',jsonb_build_object('title',d->>'n')); end $$;

revoke all on function public.admin_report_designs(),public.admin_set_report_default(jsonb) from public, anon, authenticated;
grant execute on function public.admin_report_designs(),public.admin_set_report_default(jsonb) to authenticated;
