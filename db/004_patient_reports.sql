-- Patient accounts and lab reports. Tables have no policies: all access goes through the functions below.
create table if not exists public.private_settings (key text primary key, value text not null);
alter table public.private_settings enable row level security;
insert into public.private_settings values ('pw_key', encode(extensions.gen_random_bytes(32),'hex')) on conflict do nothing;

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  phone text not null unique,
  name text not null default '',
  pass_hash text not null,
  pass_enc bytea not null,
  failed int not null default 0,
  locked_until timestamptz,
  pass_changed_at timestamptz,
  created_at timestamptz not null default now());
create table public.patient_sessions (
  token_hash text primary key,
  patient_id uuid not null references public.patients(id) on delete cascade,
  expires_at timestamptz not null);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete set null,
  title text not null default '',
  collected_at date not null default current_date,
  status text not null default 'draft' check (status in ('draft','review','approved')),
  results jsonb not null default '[]',
  notes text not null default '',
  signed_by text not null default '',
  approved_at timestamptz, approved_by text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.reports(patient_id, collected_at desc);
alter table public.patients enable row level security;
alter table public.patient_sessions enable row level security;
alter table public.reports enable row level security;
revoke all on public.private_settings, public.patients, public.patient_sessions, public.reports from anon, authenticated;
alter table public.bookings add column if not exists patient_id uuid references public.patients(id), add column if not exists patient_code text;

create function public._norm_phone(t text) returns text language plpgsql immutable set search_path = public as $$
declare d text := regexp_replace(coalesce(t,''),'\D','','g'); begin
  if d like '0092%' then d := substr(d,3); end if;
  if d like '03%' and length(d)=11 then d := '92'||substr(d,2); elsif d like '3%' and length(d)=10 then d := '92'||d; end if;
  return d; end $$;
create function public._new_pass() returns text language plpgsql volatile set search_path = public, extensions as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := gen_random_bytes(10); r text := ''; begin
  for i in 0..9 loop r := r || substr(a, get_byte(b,i) % 31 + 1, 1); end loop; return r; end $$;
create function public._pw_key() returns text language sql stable security definer set search_path = public as $$ select value from private_settings where key='pw_key' $$;
create function public._ensure_patient(p_phone text, p_name text) returns patients language plpgsql security definer set search_path = public, extensions as $$
declare n text := _norm_phone(p_phone); c text; pw text; r patients; b bytea; begin
  select * into r from patients where phone = n; if found then return r; end if;
  loop b := gen_random_bytes(4); c := 'FA' || lpad((((get_byte(b,0)::bigint<<16)+(get_byte(b,1)<<8)+get_byte(b,2)) % 1000000)::text,6,'0'); exit when not exists (select 1 from patients where code=c); end loop;
  pw := _new_pass();
  insert into patients(code,phone,name,pass_hash,pass_enc) values (c,n,left(coalesce(p_name,''),120),crypt(pw,gen_salt('bf',8)),pgp_sym_encrypt(pw,_pw_key())) on conflict (phone) do nothing;
  select * into r from patients where phone = n; return r; end $$;
create function public._booking_patient() returns trigger language plpgsql security definer set search_path = public as $$
declare p patients; begin p := _ensure_patient(new.phone,new.name); new.patient_id := p.id; new.patient_code := p.code; return new; end $$;
create trigger bookings_patient before insert on public.bookings for each row execute function public._booking_patient();

create function public.patient_login(login text, pass text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare p patients; l text := upper(trim(coalesce(login,''))); n text := _norm_phone(login); t text; begin
  select * into p from patients where upper(code)=l or (length(n)>=10 and phone=n) for update;
  if not found then perform crypt(coalesce(pass,''),gen_salt('bf',8)); return jsonb_build_object('error','Wrong ID or password'); end if;
  if p.locked_until > now() then return jsonb_build_object('error','Too many tries. Please wait 15 minutes.'); end if;
  if p.pass_hash <> crypt(coalesce(pass,''),p.pass_hash) then
    update patients set failed = case when failed>=4 then 0 else failed+1 end, locked_until = case when failed>=4 then now()+interval '15 minutes' else locked_until end where id=p.id;
    return jsonb_build_object('error','Wrong ID or password'); end if;
  update patients set failed=0, locked_until=null where id=p.id;
  delete from patient_sessions where expires_at < now();
  t := encode(gen_random_bytes(32),'hex');
  insert into patient_sessions values (encode(digest(t,'sha256'),'hex'),p.id,now()+interval '60 minutes');
  return jsonb_build_object('token',t); end $$;
create function public.patient_reports(t text) returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare p patients; b bookings; begin
  select x.* into p from patient_sessions s join patients x on x.id=s.patient_id where s.token_hash=encode(digest(coalesce(t,''),'sha256'),'hex') and s.expires_at>now();
  if not found then return jsonb_build_object('error','expired'); end if;
  select * into b from bookings where patient_id=p.id order by created_at desc limit 1;
  return jsonb_build_object('patient',jsonb_build_object('name',p.name,'code',p.code,'age',b.age,'gender',b.gender),
    'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'collected_at',r.collected_at,'approved_at',r.approved_at,'results',r.results,'notes',r.notes,'signed_by',r.signed_by) order by r.collected_at desc, r.approved_at desc) from reports r where r.patient_id=p.id and r.status='approved'),'[]')); end $$;
create function public.patient_logout(t text) returns void language sql security definer set search_path = public, extensions as $$ delete from patient_sessions where token_hash=encode(digest(coalesce(t,''),'sha256'),'hex') $$;

create function public.admin_patients(q text default '') returns jsonb language plpgsql stable security definer set search_path = public as $$
begin if not _can('patients') then raise exception 'Not allowed'; end if;
 return coalesce((select jsonb_agg(x order by x.created_at desc) from (select p.id,p.code,p.name,p.phone,p.created_at,p.locked_until,(select count(*) from bookings b where b.patient_id=p.id) bookings,(select count(*) from reports r where r.patient_id=p.id) reports from patients p where q='' or p.name ilike '%'||q||'%' or p.code ilike '%'||q||'%' or p.phone like '%'||_norm_phone(q)||'%' and _norm_phone(q)<>'' order by p.created_at desc limit 300) x),'[]'); end $$;
create function public.admin_patient_password(i uuid) returns text language plpgsql security definer set search_path = public, extensions as $$
declare p patients; begin if not _can('patients') then raise exception 'Not allowed'; end if;
 select * into p from patients where id=i; if not found then raise exception 'Patient not found'; end if;
 perform _log('Viewed patient login','patients',jsonb_build_object('title',p.code)); return pgp_sym_decrypt(p.pass_enc,_pw_key()); end $$;
create function public.admin_reset_patient_password(i uuid, cnic_seen boolean) returns text language plpgsql security definer set search_path = public, extensions as $$
declare p patients; pw text := _new_pass(); begin if not _can('patients') then raise exception 'Not allowed'; end if;
 if cnic_seen is not true then raise exception 'Check the CNIC in person first'; end if;
 update patients set pass_hash=crypt(pw,gen_salt('bf',8)),pass_enc=pgp_sym_encrypt(pw,_pw_key()),failed=0,locked_until=null,pass_changed_at=now() where id=i returning * into p;
 if not found then raise exception 'Patient not found'; end if;
 delete from patient_sessions where patient_id=i; perform _log('Changed patient password (CNIC checked)','patients',jsonb_build_object('title',p.code)); return pw; end $$;
create function public.admin_set_patient_name(i uuid, n text) returns void language plpgsql security definer set search_path = public as $$
begin if not _can('patients') then raise exception 'Not allowed'; end if; update patients set name=left(n,120) where id=i; perform _log('Changed patient name','patients'); end $$;
create function public.admin_add_walkin(b jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare r text; x bookings; begin if not _can('bookings') then raise exception 'Not allowed'; end if;
 r := create_booking(b); update bookings set status='confirmed' where ref=r returning * into x;
 perform _log('Added walk-in','bookings',jsonb_build_object('ref',r)); return jsonb_build_object('ref',r,'code',x.patient_code,'patient_id',x.patient_id); end $$;
create function public.admin_reports() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin if not _can('reports') then raise exception 'Not allowed'; end if;
 return coalesce((select jsonb_agg(x order by x.collected_at desc,x.created_at desc) from (select r.*,p.code,p.name,p.phone from reports r join patients p on p.id=r.patient_id order by r.collected_at desc limit 500) x),'[]'); end $$;
create function public.admin_save_report(r jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare i uuid := nullif(r->>'id','')::uuid; st text := coalesce(r->>'status','draft'); pid uuid := nullif(r->>'patient_id','')::uuid; bid uuid := nullif(r->>'booking_id','')::uuid; res jsonb := coalesce(r->'results','[]'); old reports; who text; begin
 if not _can('reports') then raise exception 'Not allowed'; end if;
 if pid is null then raise exception 'Choose a patient'; end if;
 if st='approved' and (jsonb_array_length(res)=0 or exists (select 1 from jsonb_array_elements(res) e where trim(coalesce(e->>'value',''))='')) then raise exception 'Enter a result for every test before approving'; end if;
 select email into who from profiles where id=auth.uid();
 if i is not null then select * into old from reports where id=i; end if;
 if i is null then insert into reports(patient_id,booking_id,title,collected_at,status,results,notes,signed_by,approved_at,approved_by)
   values (pid,bid,left(coalesce(r->>'title',''),200),coalesce(nullif(r->>'collected_at','')::date,current_date),st,res,left(coalesce(r->>'notes',''),2000),left(coalesce(r->>'signed_by',''),120),case when st='approved' then now() end,case when st='approved' then who end) returning id into i;
 else update reports set title=left(coalesce(r->>'title',''),200),collected_at=coalesce(nullif(r->>'collected_at','')::date,collected_at),status=st,results=res,notes=left(coalesce(r->>'notes',''),2000),signed_by=left(coalesce(r->>'signed_by',''),120),updated_at=now(),approved_at=case when st='approved' then coalesce(approved_at,now()) end,approved_by=case when st='approved' then coalesce(approved_by,who) end where id=i; end if;
 if st='approved' and bid is not null then update bookings set status='report_ready' where id=bid and status not in ('completed','cancelled'); end if;
 perform _log(case when st='approved' then 'Approved lab report' else 'Saved lab report' end,'reports',jsonb_build_object('title',r->>'title')); return i; end $$;
create function public.admin_delete_report(i uuid) returns void language plpgsql security definer set search_path = public as $$
begin if not _can('reports') then raise exception 'Not allowed'; end if; delete from reports where id=i; perform _log('Deleted lab report','reports'); end $$;

revoke all on function public._norm_phone(text),public._new_pass(),public._pw_key(),public._ensure_patient(text,text),public._booking_patient(),public.admin_patients(text),public.admin_patient_password(uuid),public.admin_reset_patient_password(uuid,boolean),public.admin_set_patient_name(uuid,text),public.admin_add_walkin(jsonb),public.admin_reports(),public.admin_save_report(jsonb),public.admin_delete_report(uuid) from public, anon, authenticated;
revoke all on function public.patient_login(text,text),public.patient_reports(text),public.patient_logout(text) from public;
grant execute on function public.patient_login(text,text),public.patient_reports(text),public.patient_logout(text) to anon, authenticated;
grant execute on function public.admin_patients(text),public.admin_patient_password(uuid),public.admin_reset_patient_password(uuid,boolean),public.admin_set_patient_name(uuid,text),public.admin_add_walkin(jsonb),public.admin_reports(),public.admin_save_report(jsonb),public.admin_delete_report(uuid) to authenticated;
