-- PostgREST ON CONFLICT cannot infer the legacy partial index.
-- A non-partial unique index still permits multiple NULL external IDs while
-- making (source, external_order_id) a valid upsert target.

drop index if exists idx_orders_source_external_id;

create unique index if not exists idx_orders_source_external_id
  on orders(source, external_order_id);
