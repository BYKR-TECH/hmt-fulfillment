import Link from 'next/link';
import { allowed } from '@/lib/ops/guard.ts';
import { loadShipmentBoard } from '@/lib/ops/data.ts';
import { formatDate, SHIPMENT_META, SHIPMENT_STATES, trackingLink, type ShipmentState } from '@/lib/ops/model.ts';
import { Card, Empty, NoAccess, PageHead, ShipmentBadge, Tabs } from '@/components/ops/ui';

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ShipmentsPage({ searchParams }: { searchParams: Search }) {
  if (!(await allowed('orders.view'))) return <NoAccess />;
  const params = await searchParams;
  const state = typeof params.state === 'string' ? params.state : '';
  const courier = typeof params.courier === 'string' ? params.courier : '';
  const board = await loadShipmentBoard({ state, courier });
  const href = (next: { state?: string; courier?: string }) => {
    const query = new URLSearchParams();
    const s = next.state ?? state;
    const c = next.courier ?? courier;
    if (s) query.set('state', s);
    if (c) query.set('courier', c);
    return `/ops/shipments${query.size ? `?${query}` : ''}`;
  };
  const states = SHIPMENT_STATES.filter(s => board.counts[s]);

  return (
    <>
      <PageHead eyebrow="Records" title="Shipments" sub="Every shipment from the last 180 days, most recently updated first." />
      <div className="ops-toolbar">
        <Tabs items={[{ key: '', label: 'All' }, ...states.map(s => ({ key: s, label: SHIPMENT_META[s as ShipmentState].label }))].map(item => ({
          href: href({ state: item.key }), label: item.label, count: item.key ? board.counts[item.key] : undefined, active: state === item.key
        }))} />
        <Tabs items={[{ key: '', label: 'All couriers' }, ...board.couriers.map(c => ({ key: c, label: c }))].map(item => ({
          href: href({ courier: item.key }), label: <span style={{ textTransform: 'capitalize' }}>{item.label}</span>, active: courier === item.key
        }))} />
      </div>
      <Card flush>
        {board.rows.length ? (
          <div className="ops-table-wrap">
            <table className="ops-table stack">
              <thead><tr><th>AWB</th><th>Order</th><th>Status</th><th className="ops-hide-mobile">From</th><th>Updated</th></tr></thead>
              <tbody>
                {board.rows.map(({ order, shipment }) => {
                  const link = trackingLink(shipment.waybill);
                  return (
                    <tr key={shipment.id}>
                      <td>
                        {link ? <a className="mono row-link" href={link} target="_blank" rel="noreferrer">{shipment.waybill}</a> : <span className="faint">No AWB</span>}
                        <span className="sub" style={{ textTransform: 'capitalize' }}>{shipment.courier_code}{shipment.direction === 'reverse' ? ' · return' : ''}</span>
                      </td>
                      <td><Link href={`/ops/orders/${order.id}`} prefetch={false} className="row-link">#{order.number}</Link><span className="sub">{order.customer}</span></td>
                      <td><ShipmentBadge state={shipment.state} />{shipment.inferred ? <span className="sub">from store status</span> : null}</td>
                      <td className="ops-hide-mobile">{shipment.pickup_location || '—'}</td>
                      <td className="nowrap">{formatDate(shipment.updated_at, true)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {board.total > board.rows.length ? <div className="ops-pager"><span>Showing {board.rows.length} of {board.total}. Narrow with the filters above.</span></div> : null}
          </div>
        ) : <Empty title="No shipments in this view" />}
      </Card>
    </>
  );
}
