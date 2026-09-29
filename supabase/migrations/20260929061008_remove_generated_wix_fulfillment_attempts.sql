-- Wix fulfillment polling is observational and must not be retained as a
-- carrier booking attempt. Preserve genuine booking history while using a
-- truncate-and-restore operation so PostgreSQL releases the generated table
-- storage immediately instead of retaining hundreds of MB of dead tuples.
set lock_timeout = '10s';

create temporary table shipment_attempts_keep
on commit drop
as
select *
from public.shipment_attempts
where coalesce(request_payload ->> 'source', '') <> 'wix-fulfillment';

truncate table public.shipment_attempts;

insert into public.shipment_attempts (
  id,
  shipment_id,
  attempt_number,
  request_payload,
  response_payload,
  http_status,
  success,
  error,
  created_at
)
select
  id,
  shipment_id,
  attempt_number,
  request_payload,
  response_payload,
  http_status,
  success,
  error,
  created_at
from shipment_attempts_keep;

-- This table was a one-time safety copy created by the address cleanup
-- migration. The cleanup has been in production since June 2026 and the
-- active customer_addresses table is now authoritative.
drop table if exists public.customer_address_cleanup_backup;

analyze public.shipment_attempts;
