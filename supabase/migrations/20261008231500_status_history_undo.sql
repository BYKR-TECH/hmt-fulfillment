-- Extend status_history for operator undo of status changes.
-- Apply on deploy (saipi / Supabase) — app deploy does not auto-run migrations.
-- Safe to apply after code lands; code falls back to JSON-in-old_value if columns missing.

alter table status_history add column if not exists shipment_id uuid references shipments(id) on delete set null;
alter table status_history add column if not exists action text;
alter table status_history add column if not exists side_effects jsonb not null default '{}'::jsonb;
alter table status_history add column if not exists undoes_history_id uuid references status_history(id) on delete set null;
alter table status_history add column if not exists undone_at timestamptz;
alter table status_history add column if not exists confirm_backward boolean not null default false;
alter table status_history add column if not exists reason text;

create index if not exists idx_status_history_order_action
  on status_history(order_id, created_at desc);

create index if not exists idx_status_history_shipment_id
  on status_history(shipment_id);

comment on column status_history.action is 'Operator action key, e.g. mark_picked_up, order_status_change, undo';
comment on column status_history.side_effects is 'Channel side effects at change time (whatsapp_sent, wix_fulfilled, woo_writeback)';
comment on column status_history.undoes_history_id is 'When action=undo, points at the history row being reverted';
comment on column status_history.undone_at is 'Set when this change has been undone';
