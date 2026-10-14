import Link from 'next/link';
import { Plus, SearchX } from 'lucide-react';
import { allowed } from '@/lib/ops/guard.ts';
import { listOrders, STAGE_GROUPS } from '@/lib/ops/data.ts';
import { formatDate, formatMoney, LANE_LABEL, STAGE_META, type Lane, type OrderStage } from '@/lib/ops/model.ts';
import { Card, Empty, NoAccess, PageHead, StageBadge, Tabs } from '@/components/ops/ui';

type Search = Promise<Record<string, string | string[] | undefined>>;

const TABS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'to_book', label: 'To book' },
  { key: 'awaiting_pickup', label: 'Awaiting pickup' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'problems', label: 'Problems' },
  { key: 'closed', label: 'Unpaid & cancelled' }
];

export default async function OrdersPage({ searchParams }: { searchParams: Search }) {
  if (!(await allowed('orders.view'))) return <NoAccess />;
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] ?? '' : value ?? '';
  };
  const q = one('q');
  const stage = one('stage');
  const lane = one('lane');
  const page = Number(one('page')) || 1;
  const result = await listOrders({ q, stage, lane, page });

  const href = (changes: Record<string, string | number>) => {
    const next = new URLSearchParams();
    const merged = { q, stage, lane, page: '', ...changes } as Record<string, string | number>;
    for (const [key, value] of Object.entries(merged)) if (value !== '' && value !== 1 && value !== '1') next.set(key, String(value));
    const text = next.toString();
    return `/ops/orders${text ? `?${text}` : ''}`;
  };
  const groupCount = (key: string) => key ? (STAGE_GROUPS[key] ?? [key as OrderStage]).reduce((sum, s) => sum + (result.counts[s] ?? 0), 0) : Object.values(result.counts).reduce((a, b) => a + b, 0);
  const singleStage = stage && !STAGE_GROUPS[stage] && STAGE_META[stage as OrderStage] ? STAGE_META[stage as OrderStage].label : '';

  return (
    <>
      <PageHead
        eyebrow="Records"
        title={q ? `Results for “${q}”` : singleStage ? `Orders · ${singleStage}` : 'Orders'}
        sub={q ? `${result.total} matching order${result.total === 1 ? '' : 's'} across all time.` : 'Last 180 days. Search finds older orders by number, name, phone or AWB.'}
        actions={<Link className="btn" href="/orders" prefetch={false} title="Manual orders are still created on the old Orders screen"><Plus size={15} /> New order</Link>}
      />

      <div className="ops-toolbar">
        <Tabs items={TABS.map(tab => ({ href: href({ stage: tab.key }), label: tab.label, count: groupCount(tab.key), active: (stage || '') === tab.key }))} />
        <Tabs items={[{ key: '', label: 'All lanes' }, ...(['domestic', 'intl_standard', 'intl_express'] as Lane[]).map(key => ({ key, label: LANE_LABEL[key] }))].map(item => ({
          href: href({ lane: item.key }), label: item.label, active: (lane || '') === item.key
        }))} />
      </div>

      <Card flush>
        {result.orders.length ? (
          <>
            <div className="ops-table-wrap">
              <table className="ops-table stack">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th className="ops-hide-narrow">Items</th>
                    <th>Stage</th>
                    <th className="ops-hide-mobile">Shipment</th>
                    <th className="right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {result.orders.map(order => (
                    <tr key={order.id}>
                      <td className="nowrap">
                        <Link href={`/ops/orders/${order.id}`} prefetch={false} className="row-link">#{order.number}</Link>
                        <span className="sub">{formatDate(order.placedAt, true)}</span>
                      </td>
                      <td>
                        {order.customer}
                        <span className="sub">{[order.city, order.country && order.country !== 'IN' ? order.country : ''].filter(Boolean).join(', ') || order.phone}</span>
                      </td>
                      <td className="ops-hide-narrow" style={{ maxWidth: 260 }}><span className="sub" style={{ color: 'var(--ink-2)', whiteSpace: 'normal' }}>{order.items || '—'}</span></td>
                      <td>
                        <StageBadge stage={order.stage} />
                        {order.review.length ? <span className="sub" style={{ color: 'var(--tone-warn-fg)' }}>Needs review</span> : null}
                      </td>
                      <td className="ops-hide-mobile">
                        {order.shipment?.waybill ? <span className="mono">{order.shipment.waybill}</span> : <span className="faint">—</span>}
                        {order.shipment?.courier_code ? <span className="sub" style={{ textTransform: 'capitalize' }}>{order.shipment.courier_code}</span> : null}
                      </td>
                      <td className="right num">{formatMoney(order.total, order.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ops-pager">
              <span>Page {result.page} of {result.pageCount} · {result.total} orders</span>
              <div className="ops-actions">
                {result.page > 1 ? <Link className="btn sm" href={href({ page: result.page - 1 })} prefetch={false}>Previous</Link> : null}
                {result.page < result.pageCount ? <Link className="btn sm" href={href({ page: result.page + 1 })} prefetch={false}>Next</Link> : null}
              </div>
            </div>
          </>
        ) : (
          <Empty title={q ? 'No orders match that search' : 'No orders in this view'} icon={<SearchX size={20} />}>
            {q ? 'Try the order number without “#”, the last digits of the phone, or the full AWB.' : null}
          </Empty>
        )}
      </Card>
    </>
  );
}
