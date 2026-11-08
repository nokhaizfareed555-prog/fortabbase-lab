-- Applied to the live database as migration family_relations_and_credential_permission.
-- Adds relation and person_name to bookings and reports; passes them through create_booking,
-- patient_reports and admin_save_report; admin_patient_password and admin_reset_patient_password
-- now require the per-staff permission patient_credentials.
alter table public.bookings add column if not exists relation text not null default '', add column if not exists person_name text not null default '';
alter table public.reports add column if not exists relation text not null default '', add column if not exists person_name text not null default '';
