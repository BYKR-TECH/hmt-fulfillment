alter table abandoned_cart_leads
  alter column wix_abandoned_checkout_id drop not null,
  add column if not exists source text not null default 'wix',
  add column if not exists external_checkout_id text;

update abandoned_cart_leads
set source = 'wix', external_checkout_id = wix_abandoned_checkout_id
where external_checkout_id is null;

alter table abandoned_cart_leads
  alter column external_checkout_id set not null;

create unique index if not exists idx_abandoned_cart_leads_source_external_checkout
  on abandoned_cart_leads(source, external_checkout_id);

create index if not exists idx_abandoned_cart_leads_source_updated
  on abandoned_cart_leads(source, wix_updated_at desc);
