import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { AbandonedCartLeadForm } from '@/components/abandoned-cart-lead-form';
import { getAbandonedCartLead } from '@/lib/crm/abandoned-carts';

export const dynamic = 'force-dynamic';
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

export default async function AbandonedCartLeadPage({ params }) {
  const { id } = await params;
  const lead = await getAbandonedCartLead(id);
  if (!lead) notFound();
  return <AppShell>
    <LeadHeader lead={lead} />
    <section className="grid orderOpsGrid">
      <LeadDetails lead={lead} />
      <RecoveryDetails lead={lead} />
    </section>
    <section className="panel" style={{ marginTop: 18 }}><div className="panelHeader"><h2>Operator workspace</h2></div><div className="panelBody"><AbandonedCartLeadForm lead={lead} /></div></section>
  </AppShell>;
}

function LeadHeader({ lead }) {
  return <header className="pageHeader">
    <div><p className="eyebrow">Abandoned-cart lead</p><h1>{lead.customer_name || 'Unknown shopper'}</h1><p className="muted">Abandoned {formatDate(lead.wix_created_at)} · {lead.currency || 'INR'} {lead.cart_value || 0}</p></div>
    <div className="toolbar"><Link className="button secondary" href="/abandoned-carts">Back to queue</Link>{lead.checkout_url ? <a className="button" href={lead.checkout_url} target="_blank" rel="noreferrer">Open checkout</a> : null}</div>
  </header>;
}

function LeadDetails({ lead }) {
  const items = (lead.items || []).map(item => item.productName?.translated || item.productName?.original || item.productName || item.name || item.product?.name).filter(name => typeof name === 'string').join(', ') || '-';
  return <article className="panel opsMain"><div className="panelHeader"><h2>Customer & cart</h2></div><div className="panelBody detailList">
    <Detail label="Phone" value={lead.phone || '-'} /><Detail label="Email" value={lead.email || '-'} /><Detail label="Abandoned" value={formatDate(lead.wix_created_at)} /><Detail label="Last cart activity" value={formatDate(lead.wix_updated_at)} />
    <Detail label="Cart value" value={`${lead.currency || 'INR'} ${lead.cart_value || 0}`} /><Detail label="Source" value={lead.source === 'woocommerce' ? 'WooCommerce' : 'Wix'} /><Detail label="Source status" value={lead.wix_status || '-'} /><Detail label="Items" value={items} />
  </div></article>;
}

function RecoveryDetails({ lead }) {
  const recoveredOrder = lead.recovered_order;
  return <article className="panel"><div className="panelHeader"><h2>Recovery</h2></div><div className="panelBody detailList">
    <Detail label="Status" value={recoveredOrder ? 'Recovered' : 'Not recovered'} /><Detail label="Recovered on" value={formatDate(lead.recovered_at)} /><Detail label="Match method" value={lead.recovery_match_method?.replaceAll('_', ' ') || '-'} />
    <Detail label="Recovered order" value={recoveredOrder ? <Link href={`/orders/${recoveredOrder.id}`}>{recoveredOrder.order_number || recoveredOrder.external_order_id || 'Open order'}</Link> : '-'} />
  </div></article>;
}

function Detail({ label, value }) { return <div className="detailRow"><span>{label}</span><strong>{value}</strong></div>; }
function formatDate(value) { return value ? DATE_TIME_FORMATTER.format(new Date(value)) : '-'; }
