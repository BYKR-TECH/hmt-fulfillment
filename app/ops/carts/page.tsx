import Link from 'next/link';
import { MessageCircle, Phone } from 'lucide-react';
import { allowed } from '@/lib/ops/guard.ts';
import { loadCarts } from '@/lib/ops/data.ts';
import { formatMoney, relativeAge } from '@/lib/ops/model.ts';
import { Badge, Card, Empty, NoAccess, PageHead, Tabs } from '@/components/ops/ui';

type Search = Promise<Record<string, string | string[] | undefined>>;
const STAGES = [
  { key: 'new', label: 'New' }, { key: 'contacted', label: 'Contacted' }, { key: 'follow_up', label: 'Follow up' },
  { key: 'recovered', label: 'Recovered' }, { key: 'not_interested', label: 'Not interested' }, { key: 'closed', label: 'Closed' }
];

export default async function CartsPage({ searchParams }: { searchParams: Search }) {
  if (!(await allowed('carts.view'))) return <NoAccess />;
  const params = await searchParams;
  const stage = typeof params.stage === 'string' ? params.stage : 'new';
  const carts = await loadCarts(stage);
  const now = Date.now();

  return (
    <>
      <PageHead eyebrow="Records" title="Abandoned carts" sub="Checkouts that never became a paid order. Recovered automatically when the same phone or email pays later." />
      <Tabs items={STAGES.map(item => ({ href: `/ops/carts?stage=${item.key}`, label: item.label, active: stage === item.key }))} />
      <Card flush>
        {carts.length ? (
          <ul className="ops-list">
            {carts.map(cart => {
              const due = cart.next_follow_up_at && Date.parse(cart.next_follow_up_at) <= now;
              const digits = String(cart.phone || '').replace(/\D/g, '');
              const items = (cart.items ?? []).map(item => item.name || item.productName).filter(Boolean).join(', ');
              return (
                <li key={cart.id}>
                  <div className="grow">
                    <Link href={`/abandoned-carts/${cart.id}`} prefetch={false} className="title" style={{ display: 'block' }}>{cart.customer_name || cart.email || cart.phone || 'Unknown'}</Link>
                    <div className="sub">{items || 'No items recorded'} · {cart.source === 'woocommerce' ? 'Woo' : cart.source}</div>
                  </div>
                  <div className="ops-hide-mobile num" style={{ fontWeight: 600 }}>{formatMoney(cart.cart_value, cart.currency || 'INR')}</div>
                  {due ? <Badge tone="warn">Follow-up due</Badge> : null}
                  {cart.recovered_order_id ? <Badge tone="ok">Recovered</Badge> : null}
                  <div className="ops-actions" style={{ flexWrap: 'nowrap' }}>
                    {digits ? <a className="btn sm ghost" href={`tel:${cart.phone}`} title="Call"><Phone size={14} /></a> : null}
                    {digits ? <a className="btn sm ghost" href={`https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`} target="_blank" rel="noreferrer" title="WhatsApp"><MessageCircle size={14} /></a> : null}
                  </div>
                  <span className="faint nowrap" style={{ fontSize: 12, minWidth: 70, textAlign: 'right' }}>{relativeAge(cart.wix_created_at || cart.created_at)}</span>
                </li>
              );
            })}
          </ul>
        ) : <Empty title="No carts in this stage" />}
      </Card>
      <p className="faint" style={{ fontSize: 12.5 }}>Open a cart to log a call, set the next follow-up or change its stage (old screen for now).</p>
    </>
  );
}
