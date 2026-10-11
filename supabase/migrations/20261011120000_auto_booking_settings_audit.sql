-- Settings remain in crm_settings; deliberately do not seed auto_booking.
create table if not exists crm_settings_audit (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null,
  actor_user_id uuid references users(id) on delete set null,
  actor_auth_user_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_crm_settings_audit_key_created on crm_settings_audit(setting_key, created_at desc);
alter table crm_settings_audit enable row level security;
grant select on crm_settings_audit to authenticated, service_role;
create policy "ops managers can read settings audit" on crm_settings_audit for select to authenticated
using (exists (select 1 from users u where u.auth_user_id = (select auth.uid()) and u.active and u.role in ('admin', 'operations_manager')));

create or replace function audit_crm_settings_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    insert into crm_settings_audit(setting_key, actor_user_id, actor_auth_user_id, old_value, new_value)
    values (NEW.key, NEW.updated_by, coalesce(auth.uid(), (select auth_user_id from users where id = NEW.updated_by)), null, NEW.value);
  elsif OLD.value is distinct from NEW.value then
    insert into crm_settings_audit(setting_key, actor_user_id, actor_auth_user_id, old_value, new_value)
    values (NEW.key, NEW.updated_by, coalesce(auth.uid(), (select auth_user_id from users where id = NEW.updated_by)), OLD.value, NEW.value);
  end if;
  return NEW;
end;
$$;
revoke all on function audit_crm_settings_change() from public;
drop trigger if exists crm_settings_change_audit on crm_settings;
create trigger crm_settings_change_audit after insert or update on crm_settings
for each row execute function audit_crm_settings_change();
