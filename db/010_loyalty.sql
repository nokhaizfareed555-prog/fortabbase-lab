-- Loyalty: applied to the live database on 9 Nov 2026 as migration "loyalty".
-- Points = completed bookings under the rules in private_settings key 'loyalty', plus loyalty_adjustments.
-- Functions: _loyalty_rules, _loyalty (internal); admin_loyalty_rules, admin_save_loyalty_rules, admin_loyalty_list,
-- admin_loyalty_adjust (permission key "loyalty"). admin_patients, list_bookings and patient_reports return the count.
-- The full SQL is held in the database migration history.
create table if not exists public.loyalty_adjustments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  delta int not null, reason text not null, actor uuid, at timestamptz not null default now());
alter table public.loyalty_adjustments enable row level security;
