-- Admin chat: per-person daily message counter. Only the admin-chat Edge Function can touch it.
-- Conversations are not stored anywhere.
create table if not exists public.admin_chat_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  n integer not null default 0,
  primary key (user_id, day)
);
alter table public.admin_chat_usage enable row level security;
-- No policies: no direct access for anon or signed-in users.

create or replace function public.admin_chat_hit(p_user uuid, p_limit integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_day date := (now() at time zone 'Asia/Karachi')::date; v_n integer;
begin
  insert into admin_chat_usage(user_id, day, n) values (p_user, v_day, 1)
  on conflict (user_id, day) do update set n = admin_chat_usage.n + 1
  where admin_chat_usage.n < p_limit
  returning n into v_n;
  delete from admin_chat_usage where day < v_day - 30;
  return v_n; -- null means the limit is already reached
end $$;
revoke all on function public.admin_chat_hit(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_chat_hit(uuid, integer) to service_role;
